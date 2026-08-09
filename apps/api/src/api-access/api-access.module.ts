import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DealsModule } from "../deals/deals.module";
import { FieldsModule } from "../fields/fields.module";
import { SurveysModule } from "../surveys/surveys.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ApiAccessController } from "./api-access.controller";
import { ApiAccessGuard } from "./api-access.guard";
import { ApiAccessRouter } from "./api-access.router";
import { ApiAccessService } from "./api-access.service";
import { LinkedInCaptureService } from "./linkedin-capture.service";

@Module({
	imports: [
		TrpcModule,
		CompaniesModule,
		ContactsModule,
		DealsModule,
		AgentModule,
		FieldsModule,
		ActivitiesModule,
		SurveysModule,
	],
	controllers: [ApiAccessController],
	providers: [
		ApiAccessService,
		ApiAccessGuard,
		ApiAccessRouter,
		LinkedInCaptureService,
	],
	exports: [ApiAccessService],
})
export class ApiAccessModule {}
