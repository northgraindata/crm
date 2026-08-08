import { describe, expect, it } from "bun:test";
import {
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import type { ZohoClient } from "../src/zoho/zoho.client";
import { ZohoSyncService } from "../src/zoho/zoho-sync.service";

function mailbox(cursor: string | null): MailboxSync {
	return {
		id: "sync-1",
		userId: "user-1",
		authAccountId: "auth-1",
		source: "zoho",
		externalId: "mailbox-1",
		mailboxAddress: "rep@example.com",
		displayName: "Rep",
		status: GoogleSyncStatus.IDLE,
		cursor,
		lastSyncedAt: null,
		lastError: null,
		retryAfter: null,
		autoCreate: false,
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};
}

describe("Zoho sync", () => {
	it("starts forward-only without reading existing messages", async () => {
		let messageCalls = 0;
		let settledCursor: string | null | undefined;
		const zoho = {
			messages: async () => {
				messageCalls += 1;
				return { outcome: "ok", data: [] } as const;
			},
		} as unknown as ZohoClient;
		const tokens = {
			accessTokenFor: async () => ({ outcome: "ok", accessToken: "token" }),
		} as unknown as MailboxTokenService;
		const state = {
			markRunning: async () => undefined,
			settle: async (_id: string, update: { cursor?: string | null }) => {
				settledCursor = update.cursor;
			},
		} as unknown as SyncStateService;
		const threads = {} as ThreadWriterService;
		const service = new ZohoSyncService(zoho, tokens, state, threads);

		expect((await service.sync(mailbox(null))).status).toBe("synced");
		expect(messageCalls).toBe(0);
		expect(Number(settledCursor)).toBeGreaterThan(0);
	});

	it("writes the oldest batch first and advances its cursor", async () => {
		const written: string[] = [];
		let settledCursor: string | null | undefined;
		const messages = Array.from({ length: 121 }, (_, index) => ({
			messageId: String(index + 1),
			folderId: "inbox",
			receivedTime: index + 1,
		}));
		const zoho = {
			messages: async () => ({ outcome: "ok", data: messages }) as const,
			headers: async (
				_token: string,
				_account: string,
				_folder: string,
				messageId: string,
			) => ({
				outcome: "ok" as const,
				data: `Message-ID: <${messageId}@example.com>\nFrom: Sender <sender@example.com>\nTo: Rep <rep@example.com>\nDate: Sat, 08 Aug 2026 12:00:00 GMT`,
			}),
			content: async () => ({ outcome: "ok", data: "Hello" }) as const,
		} as unknown as ZohoClient;
		const tokens = {
			accessTokenFor: async () => ({ outcome: "ok", accessToken: "token" }),
		} as unknown as MailboxTokenService;
		const state = {
			markRunning: async () => undefined,
			settle: async (_id: string, update: { cursor?: string | null }) => {
				settledCursor = update.cursor;
			},
		} as unknown as SyncStateService;
		const threads = {
			context: async () => ({}),
			store: async (
				_row: MailboxSync,
				_mailbox: unknown,
				message: { zohoMessageId?: string | null },
			) => {
				written.push(message.zohoMessageId ?? "");
				return true;
			},
		} as unknown as ThreadWriterService;
		const service = new ZohoSyncService(zoho, tokens, state, threads);

		const result = await service.sync(mailbox("0"));

		expect(result.messagesWritten).toBe(120);
		expect(written.at(0)).toBe("1");
		expect(written.at(-1)).toBe("120");
		expect(settledCursor).toBe("120");
	});
});
