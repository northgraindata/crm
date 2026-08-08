import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ZohoClient } from "./zoho.client";
import { ZohoRouter } from "./zoho.router";
import { ZohoConnectionService } from "./zoho-connection.service";
import { ZohoSyncService } from "./zoho-sync.service";
import { ZohoSyncRunnerService } from "./zoho-sync-runner.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	providers: [
		ZohoClient,
		ZohoConnectionService,
		ZohoSyncService,
		ZohoSyncRunnerService,
		ZohoRouter,
	],
	exports: [ZohoConnectionService, ZohoSyncRunnerService],
})
export class ZohoModule {}
