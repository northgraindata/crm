import type { Db, Prisma } from "@crm/db";
import {
	ReminderChannel,
	ReminderStatus,
	TimeEntrySource,
	WorkTaskStatus,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	payrollSummaryInput,
	reminderListInput,
	teamMemberDocumentCreateInput,
	teamMemberDocumentUpdateInput,
	timeEntryCreateInput,
	timeEntryListInput,
	timerInput,
	workTaskCreateInput,
	workTaskListInput,
	workTaskMoveInput,
	workTaskUpdateInput,
} from "./work-management.contracts";

const taskInclude = {
	assignee: true,
	engagement: { include: { company: { select: { id: true, name: true } } } },
} as const satisfies Prisma.WorkTaskInclude;

const entryInclude = {
	teamMember: true,
	workTask: { select: { id: true, title: true, status: true } },
	engagement: { include: { company: { select: { id: true, name: true } } } },
} as const satisfies Prisma.TimeEntryInclude;

@Injectable()
export class WorkManagementService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async listTasks(input: z.infer<typeof workTaskListInput>) {
		const rows = await this.db.workTask.findMany({
			where: {
				engagementId: input.engagementId,
				...(input.status ? { status: input.status } : {}),
			},
			include: taskInclude,
			orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
		});
		return rows.map(serializeTask);
	}

	async createTask(input: z.infer<typeof workTaskCreateInput>) {
		await this.assertTaskReferences(input.engagementId, input.assigneeId);
		const row = await this.db.workTask.create({
			data: scalarTaskData(input),
			include: taskInclude,
		});
		return serializeTask(row);
	}

	async updateTask(
		id: string,
		input: z.infer<typeof workTaskUpdateInput>["data"],
	) {
		const existing = await this.db.workTask.findUnique({ where: { id } });
		if (!existing) throw new NotFoundException("Work task not found.");
		if (input.engagementId || input.assigneeId !== undefined) {
			await this.assertTaskReferences(
				input.engagementId ?? existing.engagementId,
				input.assigneeId === undefined ? existing.assigneeId : input.assigneeId,
			);
		}
		const data = scalarTaskData(input);
		if (input.status === WorkTaskStatus.DONE) data.completedAt = new Date();
		if (input.status && input.status !== WorkTaskStatus.DONE)
			data.completedAt = null;
		const row = await this.db.workTask.update({
			where: { id },
			data,
			include: taskInclude,
		});
		return serializeTask(row);
	}

	async moveTask(input: z.infer<typeof workTaskMoveInput>) {
		return this.updateTask(input.id, {
			status: input.status,
			sortOrder: input.sortOrder,
		});
	}

	async listTimeEntries(input: z.infer<typeof timeEntryListInput>) {
		const where: Prisma.TimeEntryWhereInput = {
			...(input.engagementId ? { engagementId: input.engagementId } : {}),
			...(input.teamMemberId ? { teamMemberId: input.teamMemberId } : {}),
			...(input.from || input.to
				? {
						workDate: {
							gte: input.from ? new Date(input.from) : undefined,
							lt: input.to ? new Date(input.to) : undefined,
						},
					}
				: {}),
		};
		const rows = await this.db.timeEntry.findMany({
			where,
			include: entryInclude,
			orderBy: { workDate: "desc" },
		});
		return rows.map(serializeEntry);
	}

	async createTimeEntry(input: z.infer<typeof timeEntryCreateInput>) {
		await this.assertEntryReferences(
			input.teamMemberId,
			input.engagementId,
			input.workTaskId,
		);
		const member = await this.db.teamMember.findUnique({
			where: { id: input.teamMemberId },
			select: { hourlyCost: true },
		});
		const row = await this.db.timeEntry.create({
			data: {
				...entryData(input),
				source: TimeEntrySource.MANUAL,
				hourlyCostSnapshot: member?.hourlyCost ?? null,
			},
			include: entryInclude,
		});
		await this.recalculateEngagement(input.engagementId);
		return serializeEntry(row);
	}

	async startTimer(input: z.infer<typeof timerInput>) {
		await this.assertEntryReferences(
			input.teamMemberId,
			input.engagementId,
			input.workTaskId,
		);
		const active = await this.db.timeEntry.findFirst({
			where: {
				teamMemberId: input.teamMemberId,
				endedAt: null,
				startedAt: { not: null },
			},
		});
		if (active)
			throw new BadRequestException(
				"This team member already has an active timer.",
			);
		const member = await this.db.teamMember.findUnique({
			where: { id: input.teamMemberId },
			select: { hourlyCost: true },
		});
		const now = new Date();
		const row = await this.db.timeEntry.create({
			data: {
				teamMemberId: input.teamMemberId,
				engagementId: input.engagementId,
				workTaskId: input.workTaskId ?? null,
				workDate: now,
				startedAt: now,
				source: TimeEntrySource.TIMER,
				billable: true,
				hourlyCostSnapshot: member?.hourlyCost ?? null,
			},
			include: entryInclude,
		});
		return serializeEntry(row);
	}

	async stopTimer(id: string) {
		const current = await this.db.timeEntry.findUnique({ where: { id } });
		if (!current?.startedAt || current.endedAt)
			throw new NotFoundException("Active timer not found.");
		const endedAt = new Date();
		const durationMinutes = Math.max(
			1,
			Math.ceil((endedAt.getTime() - current.startedAt.getTime()) / 60000),
		);
		const row = await this.db.timeEntry.update({
			where: { id },
			data: { endedAt, durationMinutes },
			include: entryInclude,
		});
		await this.recalculateEngagement(row.engagementId);
		return serializeEntry(row);
	}

	async payrollSummary(input: z.infer<typeof payrollSummaryInput>) {
		const start = new Date(`${input.month}-01T00:00:00.000Z`);
		const end = new Date(
			Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
		);
		const rows = await this.db.timeEntry.findMany({
			where: {
				workDate: { gte: start, lt: end },
				durationMinutes: { not: null },
			},
			include: { teamMember: true },
		});
		const grouped = new Map<
			string,
			{
				teamMember: (typeof rows)[number]["teamMember"];
				minutes: number;
				cost: number;
			}
		>();
		for (const row of rows) {
			const current = grouped.get(row.teamMemberId) ?? {
				teamMember: row.teamMember,
				minutes: 0,
				cost: 0,
			};
			current.minutes += row.durationMinutes ?? 0;
			current.cost +=
				((row.durationMinutes ?? 0) / 60) *
				Number(row.hourlyCostSnapshot ?? row.teamMember.hourlyCost ?? 0);
			grouped.set(row.teamMemberId, current);
		}
		return [...grouped.values()].map((row) => ({
			teamMember: serializeMember(row.teamMember),
			minutes: row.minutes,
			hours: row.minutes / 60,
			cost: row.cost,
		}));
	}

	async createDocument(input: z.infer<typeof teamMemberDocumentCreateInput>) {
		const member = await this.db.teamMember.findUnique({
			where: { id: input.teamMemberId },
		});
		if (!member) throw new NotFoundException("Team member not found.");
		const row = await this.db.teamMemberDocument.create({
			data: documentData(input),
			include: { reminders: true, teamMember: true },
		});
		await this.ensureReminderRows(row.id, row.expiresAt, row.reminderDays);
		return this.document(row);
	}

	async updateDocument(
		id: string,
		input: z.infer<typeof teamMemberDocumentUpdateInput>["data"],
	) {
		const row = await this.db.teamMemberDocument
			.update({
				where: { id },
				data: documentData(input),
				include: { reminders: true, teamMember: true },
			})
			.catch(() => null);
		if (!row) throw new NotFoundException("Team member document not found.");
		await this.ensureReminderRows(row.id, row.expiresAt, row.reminderDays);
		return this.document(row);
	}

	async reminders(input: z.infer<typeof reminderListInput>) {
		return this.db.teamMemberReminder.findMany({
			where: {
				...(input.status ? { status: input.status } : {}),
				...(input.channel ? { channel: input.channel } : {}),
			},
			include: { document: { include: { teamMember: true } } },
			orderBy: { dueAt: "asc" },
		});
	}

	async completeReminder(id: string) {
		return this.db.teamMemberReminder.update({
			where: { id },
			data: { status: ReminderStatus.COMPLETED, completedAt: new Date() },
		});
	}

	async runDueReminders() {
		const now = new Date();
		const due = await this.db.teamMemberReminder.findMany({
			where: {
				channel: ReminderChannel.EMAIL,
				status: ReminderStatus.PENDING,
				dueAt: { lte: now },
			},
			include: {
				document: { include: { teamMember: { include: { user: true } } } },
			},
			take: 100,
		});
		let sent = 0;
		for (const reminder of due) {
			const recipient =
				reminder.document.teamMember.email ??
				reminder.document.teamMember.user?.email;
			if (
				!recipient ||
				!(await this.sendReminderEmail(
					recipient,
					reminder.document.teamMember.name,
					reminder.document.label,
					reminder.document.expiresAt,
				))
			)
				continue;
			await this.db.teamMemberReminder.update({
				where: { id: reminder.id },
				data: { status: ReminderStatus.SENT, sentAt: now },
			});
			sent += 1;
		}
		return { checked: due.length, sent };
	}

	private async ensureReminderRows(
		documentId: string,
		expiresAt: Date | null,
		reminderDays: number,
	) {
		if (!expiresAt) return;
		const dueAt = new Date(expiresAt.getTime() - reminderDays * 86400000);
		await Promise.all(
			[ReminderChannel.CRM, ReminderChannel.EMAIL].map((channel) =>
				this.db.teamMemberReminder.upsert({
					where: { documentId_channel_dueAt: { documentId, channel, dueAt } },
					create: { documentId, channel, dueAt },
					update: {
						status: ReminderStatus.PENDING,
						completedAt: null,
						sentAt: null,
					},
				}),
			),
		);
	}

	private async sendReminderEmail(
		recipient: string,
		memberName: string,
		label: string,
		expiresAt: Date | null,
	) {
		const apiKey = process.env.RESEND_API_KEY?.trim();
		const from = process.env.RESEND_FROM_EMAIL?.trim();
		if (!apiKey || !from) return false;
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [recipient],
				subject: `Reminder: ${label}`,
				html: `<p>Hi ${escapeHtml(memberName)},</p><p>Your ${escapeHtml(label)} expires on ${expiresAt?.toISOString().slice(0, 10) ?? "an upcoming date"}.</p><p>Please update the document in CRM.</p>`,
			}),
		});
		return response.ok;
	}

	private async recalculateEngagement(engagementId: string) {
		const rows = await this.db.timeEntry.findMany({
			where: { engagementId, durationMinutes: { not: null } },
			select: {
				teamMemberId: true,
				durationMinutes: true,
				hourlyCostSnapshot: true,
			},
		});
		const minutes = rows.reduce(
			(sum, row) => sum + (row.durationMinutes ?? 0),
			0,
		);
		const cost = rows.reduce(
			(sum, row) =>
				sum +
				((row.durationMinutes ?? 0) / 60) * Number(row.hourlyCostSnapshot ?? 0),
			0,
		);
		const engagement = await this.db.engagement.findUnique({
			where: { id: engagementId },
			select: { contractValue: true },
		});
		await this.db.engagement.update({
			where: { id: engagementId },
			data: {
				actualHours: minutes / 60,
				deliveryCost: cost,
				grossMargin:
					engagement?.contractValue == null
						? null
						: Number(engagement.contractValue) - cost,
			},
		});
		await this.db.engagementAssignment.updateMany({
			where: { engagementId },
			data: { actualHours: 0 },
		});
		const assignmentHours = new Map<string, number>();
		for (const row of rows)
			assignmentHours.set(
				row.teamMemberId,
				(assignmentHours.get(row.teamMemberId) ?? 0) +
					(row.durationMinutes ?? 0) / 60,
			);
		await Promise.all(
			[...assignmentHours.entries()].map(([teamMemberId, actualHours]) =>
				this.db.engagementAssignment.updateMany({
					where: { engagementId, teamMemberId },
					data: { actualHours },
				}),
			),
		);
	}

	private async assertTaskReferences(
		engagementId: string,
		assigneeId?: string | null,
	) {
		const engagement = await this.db.engagement.findUnique({
			where: { id: engagementId },
			select: { id: true },
		});
		if (!engagement) throw new NotFoundException("Engagement not found.");
		if (
			assigneeId &&
			!(await this.db.teamMember.findUnique({
				where: { id: assigneeId },
				select: { id: true },
			}))
		)
			throw new NotFoundException("Team member not found.");
	}

	private async assertEntryReferences(
		teamMemberId: string,
		engagementId: string,
		workTaskId?: string | null,
	) {
		if (
			!(await this.db.teamMember.findUnique({
				where: { id: teamMemberId },
				select: { id: true },
			}))
		)
			throw new NotFoundException("Team member not found.");
		if (
			!(await this.db.engagement.findUnique({
				where: { id: engagementId },
				select: { id: true },
			}))
		)
			throw new NotFoundException("Engagement not found.");
		if (
			workTaskId &&
			!(await this.db.workTask.findFirst({
				where: { id: workTaskId, engagementId },
				select: { id: true },
			}))
		)
			throw new BadRequestException("Task does not belong to this engagement.");
	}

	private document(row: {
		id: string;
		kind: string;
		label: string;
		status: string;
		validFrom: Date | null;
		expiresAt: Date | null;
		reminderDays: number;
		notes: string | null;
		teamMember: unknown;
		reminders: unknown[];
	}) {
		return {
			...row,
			validFrom: row.validFrom?.toISOString() ?? null,
			expiresAt: row.expiresAt?.toISOString() ?? null,
		};
	}
}

function scalarTaskData(
	input: Record<string, unknown>,
): Prisma.WorkTaskUncheckedCreateInput {
	const data = { ...input } as Record<string, unknown>;
	for (const key of ["dueAt"])
		if (typeof data[key] === "string")
			data[key] = new Date(data[key] as string);
	return data as Prisma.WorkTaskUncheckedCreateInput;
}

function entryData(
	input: Record<string, unknown>,
): Prisma.TimeEntryUncheckedCreateInput {
	const data = {
		...input,
		workDate: new Date(input.workDate as string),
	} as Record<string, unknown>;
	return data as Prisma.TimeEntryUncheckedCreateInput;
}

function documentData(
	input: Record<string, unknown>,
): Prisma.TeamMemberDocumentUncheckedCreateInput {
	const data = { ...input } as Record<string, unknown>;
	for (const key of ["validFrom", "expiresAt"])
		if (typeof data[key] === "string")
			data[key] = new Date(data[key] as string);
	return data as Prisma.TeamMemberDocumentUncheckedCreateInput;
}

function serializeTask(
	row: Prisma.WorkTaskGetPayload<{ include: typeof taskInclude }>,
) {
	return {
		...row,
		dueAt: row.dueAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
	};
}

function serializeEntry(
	row: Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>,
) {
	return {
		...row,
		workDate: row.workDate.toISOString(),
		startedAt: row.startedAt?.toISOString() ?? null,
		endedAt: row.endedAt?.toISOString() ?? null,
		hourlyCostSnapshot:
			row.hourlyCostSnapshot == null ? null : Number(row.hourlyCostSnapshot),
	};
}

function serializeMember(row: {
	id: string;
	name: string;
	email: string | null;
	hourlyCost: unknown;
	weeklyCapacity: unknown;
}) {
	return {
		...row,
		hourlyCost: row.hourlyCost == null ? null : Number(row.hourlyCost),
		weeklyCapacity:
			row.weeklyCapacity == null ? null : Number(row.weeklyCapacity),
	};
}

function escapeHtml(value: string) {
	return value.replace(
		/[&<>'"]/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
				character
			] ?? character,
	);
}
