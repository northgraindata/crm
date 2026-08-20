import { ActivityType, ContactStatus, type Db, type Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeDomain } from "../companies/domain";
import { blankToNull, normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import type { LinkedInCaptureInput } from "./linkedin-capture.contracts";

@Injectable()
export class LinkedInCaptureService {
	private readonly logger = new Logger(LinkedInCaptureService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly fields: FieldsService,
		private readonly agent: AgentTriggerService,
	) {}

	async capture(input: LinkedInCaptureInput, userId: string) {
		const profile = canonicalProfile(input.profileUrl);
		const result = await this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, `linkedin:${profile.key}`);
			const existing = await tx.contact.findUnique({
				where: { linkedinKey: profile.key },
				select: { id: true, companyId: true },
			});
			const previousStatus = existing
				? await tx.fieldValue.findFirst({
						where: {
							contactId: existing.id,
							field: {
								entity: "CONTACT",
								key: "linkedin_connection_status",
							},
						},
						select: { option: { select: { label: true } } },
					})
				: null;

			const company = input.companyName
				? await this.company(tx, input)
				: { id: existing?.companyId ?? null, created: false };
			const email = normalizeEmail(input.email ?? "");
			if (email) {
				const emailOwner = await tx.contact.findFirst({
					where: {
						email: { equals: email, mode: "insensitive" },
						...(existing ? { id: { not: existing.id } } : {}),
					},
					select: { id: true },
				});
				if (emailOwner) {
					throw new ConflictException(
						"That email address already belongs to another contact.",
					);
				}
			}

			const data = {
				firstName: input.firstName.trim(),
				lastName: blankToNull(input.lastName ?? ""),
				...(email ? { email } : {}),
				title: blankToNull(input.title ?? ""),
				...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
				linkedinUrl: profile.url,
				linkedinKey: profile.key,
				companyId: company.id,
			};
			const contact = existing
				? await tx.contact.update({
						where: { id: existing.id },
						data,
						select: { id: true },
					})
				: await tx.contact.create({
						data: {
							...data,
							ownerId: userId,
							status: ContactStatus.TO_RESEARCH,
						},
						select: { id: true },
					});

			if (email) {
				await tx.suppressedContact.deleteMany({ where: { email } });
			}
			await this.fields.applyValues(
				tx,
				"CONTACT",
				contact.id,
				contactFields(input, previousStatus?.option?.label ?? null),
			);

			let taskId: string | null = null;
			if (input.createFollowUp) {
				const existingTask = await tx.activity.findFirst({
					where: {
						type: ActivityType.TASK,
						contactId: contact.id,
						completedAt: null,
						meta: { path: ["source"], equals: "linkedin" },
					},
					select: { id: true },
				});
				if (existingTask) taskId = existingTask.id;
				else {
					const task = await tx.activity.create({
						data: {
							type: ActivityType.TASK,
							subject:
								input.followUpSubject ??
								`Send first LinkedIn message to ${input.firstName}`,
							body: input.followUpBody ?? null,
							dueAt: input.followUpDueAt
								? new Date(input.followUpDueAt)
								: new Date(),
							occurredAt: new Date(),
							contactId: contact.id,
							companyId: company.id,
							createdById: userId,
							meta: {
								source: "linkedin",
								connectionStatus: input.connectionStatus ?? null,
							},
						},
						select: { id: true },
					});
					taskId = task.id;
				}
			}

			return {
				contactId: contact.id,
				companyId: company.id,
				taskId,
				transitioned:
					input.connectionStatus === "connected" &&
					previousStatus?.option?.label !== "Connected",
				contactCreated: !existing,
				companyCreated: company.created,
			};
		});

		if (result.companyCreated && result.companyId) {
			await this.agent.companyCreated(
				result.companyId,
				"Created from a reviewed LinkedIn capture",
			);
		}
		if (result.contactCreated) {
			await this.agent.contactCreated(
				result.contactId,
				"Created from a reviewed LinkedIn capture",
			);
		}
		try {
			await this.agent.backfill({
				kind: "relationship-triage",
				reason:
					input.connectionStatus === "connected"
						? "LinkedIn connection confirmed by the rep"
						: "LinkedIn relationship captured by the rep",
				contactIds: [result.contactId],
				budget: 8,
				priority: PRIORITY.relationshipTriage,
			});
		} catch (error) {
			this.logger.error(
				{
					message: "LinkedIn capture saved without relationship triage",
					contactId: result.contactId,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}

		return {
			contactId: result.contactId,
			companyId: result.companyId,
			taskId: result.taskId,
			transitioned: result.transitioned,
		};
	}

	private async company(
		tx: Prisma.TransactionClient,
		input: LinkedInCaptureInput,
	): Promise<{ id: string; created: boolean }> {
		const name = input.companyName?.trim();
		if (!name) throw new BadRequestException("A company needs a name.");
		const domain = normalizeDomain(
			input.companyDomain || websiteDomain(input.companyWebsite),
		);
		const website =
			input.companyWebsite?.trim() || (domain ? `https://${domain}` : null);
		const existing = domain
			? await tx.company.findUnique({ where: { domain }, select: { id: true } })
			: await tx.company.findFirst({ where: { name }, select: { id: true } });
		const company = existing
			? await tx.company.update({
					where: { id: existing.id },
					data: {
						name,
						...(domain ? { domain } : {}),
						...(website ? { website } : {}),
						...(input.companyLinkedInUrl
							? { linkedinUrl: input.companyLinkedInUrl }
							: {}),
					},
					select: { id: true },
				})
			: await tx.company.create({
					data: {
						name,
						domain,
						website,
						linkedinUrl: input.companyLinkedInUrl ?? null,
					},
					select: { id: true },
				});
		await this.fields.applyValues(
			tx,
			"COMPANY",
			company.id,
			companyFields(input),
		);
		return { id: company.id, created: !existing };
	}
}

function websiteDomain(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		return new URL(value).hostname;
	} catch {
		return undefined;
	}
}

function contactFields(
	input: LinkedInCaptureInput,
	previousStatus: string | null,
) {
	const status = connectionStatusLabel(input.connectionStatus);
	return {
		contact_origin:
			input.connectionStatus === "connected" && input.inbound
				? "LinkedIn inbound"
				: "LinkedIn outbound",
		...(status && (status !== "Unknown" || !previousStatus)
			? { linkedin_connection_status: status }
			: {}),
		...(input.reason ? { relationship_role: roleForReason(input.reason) } : {}),
		...(input.connectedAt ? { linkedin_connected_at: input.connectedAt } : {}),
		...(input.headline ? { linkedin_headline: input.headline } : {}),
		...(input.location ? { linkedin_location: input.location } : {}),
	};
}

function connectionStatusLabel(
	status: LinkedInCaptureInput["connectionStatus"],
): string | null {
	if (!status) return null;
	return {
		invited_by_us: "Invited by us",
		invited_us: "Invited us",
		connected: "Connected",
		not_connected: "Not connected",
		unknown: "Unknown",
	}[status];
}

function companyFields(input: LinkedInCaptureInput) {
	const companyType =
		input.reason === "Potential client"
			? "Prospect"
			: input.reason === "Partner"
				? "Partner"
				: input.reason === "Recruiter"
					? "Recruiter agency"
					: input.reason === "Relationship"
						? "Peer"
						: "Other";
	const partnerType =
		input.reason === "Partner"
			? "Consultant"
			: input.reason === "Recruiter"
				? "Recruiter"
				: "None";
	return {
		company_type: companyType,
		partner_type: partnerType,
		lead_source: "LinkedIn",
	};
}

function roleForReason(reason: LinkedInCaptureInput["reason"]): string {
	switch (reason) {
		case "Potential client":
			return "Buyer";
		case "Partner":
			return "Partner contact";
		case "Recruiter":
			return "Recruiter";
		case "Relationship":
			return "Peer";
		default:
			return "Other";
	}
}

function canonicalProfile(value: string): { url: string; key: string } {
	const url = new URL(value);
	if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com") {
		throw new NotFoundException("The profile URL must be a LinkedIn profile.");
	}
	const match = /^\/in\/([^/]+)/i.exec(url.pathname);
	if (!match) {
		throw new NotFoundException(
			"The profile URL must point to a LinkedIn person.",
		);
	}
	const key = match[1]?.toLowerCase();
	if (!key) {
		throw new NotFoundException(
			"The profile URL must point to a LinkedIn person.",
		);
	}
	return { url: `https://www.linkedin.com/in/${key}`, key };
}
