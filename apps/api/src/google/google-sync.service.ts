import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import { CalendarSyncService } from "./calendar-sync.service";
import { GmailSyncService } from "./gmail-sync.service";
import { GOOGLE_SYNC_SOURCES, type GoogleSyncSource } from "./google.constants";

@Injectable()
export class GoogleSyncService {
	constructor(
		private readonly state: SyncStateService,
		private readonly calendar: CalendarSyncService,
		private readonly gmail: GmailSyncService,
	) {}

	async runOne(syncId: string, source: GoogleSyncSource) {
		const row = await this.state.get(syncId);
		if (row?.source !== source) return null;

		return source === "calendar"
			? this.calendar.sync(row)
			: this.gmail.sync(row);
	}

	async runForUser(userId: string): Promise<void> {
		const rows = await this.state.listForUser(userId, GOOGLE_SYNC_SOURCES);
		for (const row of rows) {
			await this.runOne(row.id, row.source as GoogleSyncSource);
		}
	}
}
