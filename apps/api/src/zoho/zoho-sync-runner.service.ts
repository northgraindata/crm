import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import { ZohoSyncService } from "./zoho-sync.service";

@Injectable()
export class ZohoSyncRunnerService {
	constructor(
		private readonly state: SyncStateService,
		private readonly zoho: ZohoSyncService,
	) {}

	async runOne(syncId: string) {
		const row = await this.state.get(syncId);
		if (row?.source !== "zoho") return null;
		return this.zoho.sync(row);
	}

	async runForUser(userId: string): Promise<void> {
		const rows = await this.state.listForUser(userId, ["zoho"]);
		for (const row of rows) await this.zoho.sync(row);
	}
}
