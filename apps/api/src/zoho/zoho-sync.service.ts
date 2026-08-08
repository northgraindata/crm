import {
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	normaliseMessageId,
	rootMessageIdFrom,
	stripHtml,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import { ZohoClient, type ZohoMessage } from "./zoho.client";

const MAX_MESSAGES_PER_TICK = 120;
const MAX_PAGES_PER_TICK = 5;

export type ZohoSyncOutcome = {
	source: "zoho";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	reason?: string;
};

@Injectable()
export class ZohoSyncService {
	private readonly logger = new Logger(ZohoSyncService.name);

	constructor(
		private readonly zoho: ZohoClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(row: MailboxSync): Promise<ZohoSyncOutcome> {
		const token = await this.tokens.accessTokenFor(row);

		if (token.outcome === "not-connected") {
			return {
				source: "zoho",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "zoho",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		if (!row.cursor) {
			await this.state.settle(row.id, {
				cursor: String(Date.now()),
				status: GoogleSyncStatus.RUNNING,
			});
			return { source: "zoho", userId: row.userId, status: "synced" };
		}

		return this.incremental(row, token.accessToken, Number(row.cursor));
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		cursor: number,
	): Promise<ZohoSyncOutcome> {
		const pending: ZohoMessage[] = [];

		for (let page = 0; page < MAX_PAGES_PER_TICK; page += 1) {
			const result = await this.zoho.messages(
				accessToken,
				row.externalId,
				page * 200 + 1,
			);

			if (result.outcome !== "ok") return this.handleFailure(row, result);

			let reachedCursor = false;
			for (const message of result.data) {
				const receivedAt = Number(
					message.receivedTime ?? message.receivedtime ?? message.sentDateInGMT,
				);
				if (!Number.isFinite(receivedAt) || receivedAt <= cursor) {
					reachedCursor = true;
					continue;
				}
				pending.push(message);
			}

			if (reachedCursor || result.data.length < 200) break;
		}

		const context: MatchContext = await this.threads.context();
		let written = 0;

		const batch = pending
			.sort((left, right) => receivedTime(left) - receivedTime(right))
			.slice(0, MAX_MESSAGES_PER_TICK);

		for (const message of batch) {
			const parsed = await this.message(accessToken, row.externalId, message);
			if (!parsed) continue;

			const stored = await this.threads.store(
				row,
				{ mailbox: row.mailboxAddress ?? "", origin: "zoho" },
				parsed,
				context,
			);
			if (stored) written += 1;
		}

		await this.state.settle(row.id, {
			cursor:
				batch.length > 0
					? String(receivedTime(batch.at(-1) as ZohoMessage))
					: String(Date.now()),
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0) {
			this.logger.log({
				message: "Zoho incremental sync",
				userId: row.userId,
				syncId: row.id,
				messagesWritten: written,
			});
		}

		return {
			source: "zoho",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async message(
		accessToken: string,
		accountId: string,
		message: ZohoMessage,
	): Promise<IncomingMessage | null> {
		const messageId = String(message.messageId ?? "");
		const folderId = String(message.folderId ?? "");
		if (!messageId || !folderId) return null;

		const [headersResult, contentResult] = await Promise.all([
			this.zoho.headers(accessToken, accountId, folderId, messageId),
			this.zoho.content(accessToken, accountId, folderId, messageId),
		]);
		if (headersResult.outcome !== "ok" || contentResult.outcome !== "ok") {
			return null;
		}

		const headers = parseHeaders(headersResult.data);
		const rawMessageId = headers.get("message-id");
		const from = parseAddress(
			headers.get("from") ??
				`${message.sender ?? ""} <${message.fromAddress ?? ""}>`,
		);
		if (!rawMessageId || !from) return null;

		const rootId = rootMessageIdFrom({
			references: headers.get("references") ?? null,
			inReplyTo: headers.get("in-reply-to") ?? null,
			messageId: rawMessageId,
		});
		if (!rootId) return null;

		const sentAt = new Date(
			headers.get("date") ?? Number(message.sentDateInGMT ?? Date.now()),
		);
		if (Number.isNaN(sentAt.getTime())) return null;

		const to = parseAddressList(headers.get("to") ?? message.toAddress);
		const cc = parseAddressList(headers.get("cc") ?? message.ccAddress);
		const body = stripQuotedHistory(stripHtml(contentResult.data));

		return {
			rfcMessageId: normaliseMessageId(rawMessageId),
			rootId,
			subject: headers.get("subject") ?? message.subject ?? null,
			from,
			recipients: [
				...to.map((person) => ({ ...person, kind: "to" as const })),
				...cc.map((person) => ({ ...person, kind: "cc" as const })),
			],
			body,
			sentAt,
			zohoMessageId: messageId,
		};
	}

	private async handleFailure<T>(
		row: MailboxSync,
		result: Exclude<MailboxResult<T>, { outcome: "ok" }>,
	): Promise<ZohoSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source: "zoho",
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs);
			return {
				source: "zoho",
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source: "zoho",
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}
}

function receivedTime(message: ZohoMessage): number {
	const value = Number(
		message.receivedTime ?? message.receivedtime ?? message.sentDateInGMT,
	);
	return Number.isFinite(value) ? value : 0;
}

function parseHeaders(raw: string): Map<string, string> {
	const unfolded = raw.replace(/\r?\n[\t ]+/g, " ");
	const headers = new Map<string, string>();

	for (const line of unfolded.split(/\r?\n/)) {
		const separator = line.indexOf(":");
		if (separator <= 0) continue;
		const name = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (!headers.has(name)) headers.set(name, value);
	}

	return headers;
}
