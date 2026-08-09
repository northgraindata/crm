import type { Db } from "@crm/db";
import { ActivityType } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CompaniesService } from "../companies/companies.service";
import { ContactsService } from "../contacts/contacts.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import type { LinkedInCaptureInput } from "./linkedin-capture.contracts";

@Injectable()
export class LinkedInCaptureService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly contacts: ContactsService,
		private readonly fields: FieldsService,
		private readonly agent: AgentTriggerService,
	) {}

	async capture(input: LinkedInCaptureInput, userId: string) {
		const profileUrl = canonicalProfileUrl(input.profileUrl);
		const existing = await this.db.contact.findFirst({
			where: { linkedinUrl: profileUrl },
			select: { id: true, companyId: true },
		});
		const previousStatus = existing
			? await this.fields.valuesFor("CONTACT", existing.id)
			: {};

		const companyId = await this.companyId(input);
		const contact = existing
			? await this.contacts.update(existing.id, {
					firstName: input.firstName,
					lastName: input.lastName,
					title: input.title,
					linkedinUrl: profileUrl,
					companyId,
					fields: contactFields(input),
				})
			: await this.contacts
					.create({
						firstName: input.firstName,
						lastName: input.lastName,
						title: input.title,
						companyId,
					})
					.then(async (created) => {
						await this.contacts.update(created.id, {
							linkedinUrl: profileUrl,
							fields: contactFields(input),
						});
						return created;
					});

		const transitioned =
			input.connectionStatus === "connected" &&
			(previousStatus as Record<string, unknown>).linkedin_connection_status !==
				"linkedin-status-connected";

		let taskId: string | null = null;
		if (input.createFollowUp || transitioned) {
			const existingTask = await this.db.activity.findFirst({
				where: {
					type: ActivityType.TASK,
					contactId: contact.id,
					completedAt: null,
					meta: { path: ["source"], equals: "linkedin" },
				},
				select: { id: true },
			});
			if (existingTask) {
				taskId = existingTask.id;
			} else {
				const task = await this.db.activity.create({
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
						companyId,
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

		await this.agent.backfill({
			kind: "relationship-triage",
			reason:
				input.connectionStatus === "connected"
					? "LinkedIn connection confirmed by the rep"
					: "LinkedIn relationship captured by the rep",
			contactIds: [contact.id],
			budget: 8,
			priority: PRIORITY.relationshipTriage,
		});

		return { contactId: contact.id, companyId, taskId, transitioned };
	}

	private async companyId(input: LinkedInCaptureInput): Promise<string | null> {
		if (!input.companyName) return null;
		const domain = input.companyDomain
			? normalizeDomain(input.companyDomain)
			: null;
		const existing = domain
			? await this.db.company.findUnique({
					where: { domain },
					select: { id: true },
				})
			: await this.db.company.findFirst({
					where: { name: input.companyName },
					select: { id: true },
				});
		if (existing) {
			await this.companies.update(existing.id, {
				name: input.companyName,
				...(domain ? { domain } : {}),
				...(input.companyLinkedInUrl
					? { linkedinUrl: input.companyLinkedInUrl }
					: {}),
				fields: companyFields(input),
			});
			return existing.id;
		}
		const company = await this.companies.create({
			name: input.companyName,
			domain: domain ?? undefined,
		});
		await this.companies.update(company.id, {
			...(input.companyLinkedInUrl
				? { linkedinUrl: input.companyLinkedInUrl }
				: {}),
			fields: companyFields(input),
		});
		return company.id;
	}
}

function contactFields(input: LinkedInCaptureInput) {
	return {
		contact_origin:
			input.connectionStatus === "connected" && input.inbound
				? "LinkedIn inbound"
				: "LinkedIn outbound",
		linkedin_connection_status: input.connectionStatus ?? "Unknown",
		...(input.reason ? { relationship_role: roleForReason(input.reason) } : {}),
		...(input.connectedAt ? { linkedin_connected_at: input.connectedAt } : {}),
	};
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

function canonicalProfileUrl(value: string): string {
	const url = new URL(value);
	if (url.hostname !== "www.linkedin.com" && url.hostname !== "linkedin.com") {
		throw new NotFoundException("The profile URL must be a LinkedIn profile.");
	}
	const match = /^\/in\/([^/]+)/.exec(url.pathname);
	if (!match)
		throw new NotFoundException(
			"The profile URL must point to a LinkedIn person.",
		);
	return `https://www.linkedin.com/in/${match[1]}`;
}

function normalizeDomain(value: string): string | null {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.split("/")[0] || null
	);
}
