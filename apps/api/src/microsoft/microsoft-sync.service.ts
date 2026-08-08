import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	MICROSOFT_SYNC_SOURCES,
	type MicrosoftSyncSource,
} from "./microsoft.constants";
import { OutlookSyncService } from "./outlook-sync.service";

@Injectable()
export class MicrosoftSyncService {
	constructor(
		private readonly state: SyncStateService,
		private readonly outlook: OutlookSyncService,
	) {}

	async runOne(syncId: string, source: MicrosoftSyncSource) {
		const row = await this.state.get(syncId);
		if (row?.source !== source) return null;

		return this.outlook.sync(row);
	}

	async runForUser(userId: string): Promise<void> {
		const rows = await this.state.listForUser(userId, MICROSOFT_SYNC_SOURCES);
		for (const row of rows) {
			await this.runOne(row.id, row.source as MicrosoftSyncSource);
		}
	}
}
