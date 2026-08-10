import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	payrollSummaryInput,
	reminderIdInput,
	reminderListInput,
	teamMemberDocumentCreateInput,
	teamMemberDocumentFileInput,
	teamMemberDocumentListInput,
	teamMemberDocumentUpdateInput,
	timeEntryCreateInput,
	timeEntryIdInput,
	timeEntryListInput,
	timerInput,
	workTaskCreateInput,
	workTaskListInput,
	workTaskMoveInput,
	workTaskUpdateInput,
} from "./work-management.contracts";
import { WorkManagementService } from "./work-management.service";

@Router({ alias: "workManagement" })
@UseMiddlewares(AuthMiddleware)
export class WorkManagementRouter {
	constructor(
		@Inject(WorkManagementService) private readonly work: WorkManagementService,
	) {}

	@Query({ input: workTaskListInput })
	async tasks(@Input() input: z.infer<typeof workTaskListInput>) {
		return this.work.listTasks(input);
	}

	@Mutation({ input: workTaskCreateInput })
	async createTask(@Input() input: z.infer<typeof workTaskCreateInput>) {
		return this.work.createTask(input);
	}

	@Mutation({ input: workTaskUpdateInput })
	async updateTask(@Input() input: z.infer<typeof workTaskUpdateInput>) {
		return this.work.updateTask(input.id, input.data);
	}

	@Mutation({ input: workTaskMoveInput })
	async moveTask(@Input() input: z.infer<typeof workTaskMoveInput>) {
		return this.work.moveTask(input);
	}

	@Query({ input: timeEntryListInput })
	async timeEntries(@Input() input: z.infer<typeof timeEntryListInput>) {
		return this.work.listTimeEntries(input);
	}

	@Mutation({ input: timeEntryCreateInput })
	async createTimeEntry(@Input() input: z.infer<typeof timeEntryCreateInput>) {
		return this.work.createTimeEntry(input);
	}

	@Mutation({ input: timerInput })
	async startTimer(@Input() input: z.infer<typeof timerInput>) {
		return this.work.startTimer(input);
	}

	@Mutation({ input: timeEntryIdInput })
	async stopTimer(@Input("id") id: string) {
		return this.work.stopTimer(id);
	}

	@Query({ input: payrollSummaryInput })
	async payroll(@Input() input: z.infer<typeof payrollSummaryInput>) {
		return this.work.payrollSummary(input);
	}

	@Mutation({ input: teamMemberDocumentCreateInput })
	async createDocument(
		@Input() input: z.infer<typeof teamMemberDocumentCreateInput>,
	) {
		return this.work.createDocument(input);
	}

	@Query({ input: teamMemberDocumentListInput })
	async documents(@Input() input: z.infer<typeof teamMemberDocumentListInput>) {
		return this.work.documents(input.teamMemberId);
	}

	@Mutation({ input: teamMemberDocumentUpdateInput })
	async updateDocument(
		@Input() input: z.infer<typeof teamMemberDocumentUpdateInput>,
	) {
		return this.work.updateDocument(input.id, input.data);
	}

	@Mutation({ input: teamMemberDocumentFileInput })
	async attachDocumentFile(
		@Input() input: z.infer<typeof teamMemberDocumentFileInput>,
	) {
		return this.work.attachDocumentFile(input);
	}

	@Query({ input: reminderListInput })
	async reminders(@Input() input: z.infer<typeof reminderListInput>) {
		return this.work.reminders(input);
	}

	@Mutation({ input: reminderIdInput })
	async completeReminder(@Input("id") id: string) {
		return this.work.completeReminder(id);
	}
}
