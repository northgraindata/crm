import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DealsModule } from "../deals/deals.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ApiAccessController } from "./api-access.controller";
import { ApiAccessGuard } from "./api-access.guard";
import { ApiAccessRouter } from "./api-access.router";
import { ApiAccessService } from "./api-access.service";

@Module({
	imports: [TrpcModule, CompaniesModule, ContactsModule, DealsModule],
	controllers: [ApiAccessController],
	providers: [ApiAccessService, ApiAccessGuard, ApiAccessRouter],
	exports: [ApiAccessService],
})
export class ApiAccessModule {}
