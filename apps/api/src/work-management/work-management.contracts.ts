import {
	ReminderChannel,
	ReminderStatus,
	TeamMemberDocumentStatus,
	WorkTaskPriority,
	WorkTaskStatus,
} from "@crm/db";
import { z } from "zod";

const taskStatus = z.enum(
	Object.values(WorkTaskStatus) as [WorkTaskStatus, ...WorkTaskStatus[]],
);
const taskPriority = z.enum(
	Object.values(WorkTaskPriority) as [WorkTaskPriority, ...WorkTaskPriority[]],
);
const documentStatus = z.enum(
	Object.values(TeamMemberDocumentStatus) as [
		TeamMemberDocumentStatus,
		...TeamMemberDocumentStatus[],
	],
);
const reminderChannel = z.enum(
	Object.values(ReminderChannel) as [ReminderChannel, ...ReminderChannel[]],
);
const reminderStatus = z.enum(
	Object.values(ReminderStatus) as [ReminderStatus, ...ReminderStatus[]],
);
const date = z.string().datetime();

export const workTaskListInput = z.object({
	engagementId: z.string().min(1),
	status: taskStatus.optional(),
});

export const workTaskIdInput = z.object({ id: z.string().min(1) });

export const workTaskCreateInput = z.object({
	engagementId: z.string().min(1),
	assigneeId: z.string().nullable().optional(),
	title: z.string().trim().min(1).max(240),
	description: z.string().trim().max(10000).nullable().optional(),
	status: taskStatus.default(WorkTaskStatus.TODO),
	priority: taskPriority.default(WorkTaskPriority.MEDIUM),
	sortOrder: z.number().int().default(0),
	dueAt: date.nullable().optional(),
	estimatedMinutes: z.number().int().positive().nullable().optional(),
});

export const workTaskUpdateInput = z.object({
	id: z.string().min(1),
	data: workTaskCreateInput.partial(),
});

export const workTaskMoveInput = z.object({
	id: z.string().min(1),
	status: taskStatus,
	sortOrder: z.number().int(),
});

export const timeEntryListInput = z.object({
	engagementId: z.string().optional(),
	teamMemberId: z.string().optional(),
	from: date.optional(),
	to: date.optional(),
});

export const timeEntryCreateInput = z.object({
	teamMemberId: z.string().min(1),
	engagementId: z.string().min(1),
	workTaskId: z.string().nullable().optional(),
	workDate: date,
	durationMinutes: z.number().int().positive().max(1440),
	billable: z.boolean().default(true),
	note: z.string().trim().max(2000).nullable().optional(),
});

export const timerInput = z.object({
	teamMemberId: z.string().min(1),
	engagementId: z.string().min(1),
	workTaskId: z.string().nullable().optional(),
});

export const timeEntryIdInput = z.object({ id: z.string().min(1) });

export const payrollSummaryInput = z.object({
	month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const teamMemberDocumentCreateInput = z.object({
	teamMemberId: z.string().min(1),
	kind: z.string().trim().min(1).max(80),
	label: z.string().trim().min(1).max(240),
	status: documentStatus.default(TeamMemberDocumentStatus.ACTIVE),
	validFrom: date.nullable().optional(),
	expiresAt: date.nullable().optional(),
	reminderDays: z.number().int().min(0).max(365).default(30),
	notes: z.string().trim().max(2000).nullable().optional(),
});

export const teamMemberDocumentUpdateInput = z.object({
	id: z.string().min(1),
	data: teamMemberDocumentCreateInput.partial(),
});

export const reminderListInput = z.object({
	status: reminderStatus.optional(),
	channel: reminderChannel.optional(),
});

export const reminderIdInput = z.object({ id: z.string().min(1) });
