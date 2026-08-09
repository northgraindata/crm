import {
	Controller,
	ForbiddenException,
	Headers,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { WorkManagementService } from "./work-management.service";

@Controller("internal/reminders")
export class WorkManagementController {
	constructor(private readonly work: WorkManagementService) {}

	@Post("team-members")
	@AllowAnonymous()
	async teamMembers(@Headers("authorization") authorization?: string) {
		const secret = process.env.CRON_SECRET?.trim();
		if (!secret)
			throw new ServiceUnavailableException("Reminders are not configured.");
		if (authorization !== `Bearer ${secret}`) throw new ForbiddenException();
		return this.work.runDueReminders();
	}
}
