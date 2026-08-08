import { isGoogleConfigured } from "@crm/auth";
import { type Db, GoogleSyncStatus, type Prisma } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { normalizeDomain } from "../companies/domain";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxMatchService } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import { CalendarClient } from "./calendar.client";
import {
	GOOGLE_PROVIDER_ID,
	GOOGLE_SYNC_SOURCES,
	type GoogleSyncSource,
	SCOPE_FOR_SOURCE,
} from "./google.constants";

const PURGE_TIMEOUT_MS = 60_000;

export type SourceStatus = {
	id: string;
	source: GoogleSyncSource;
	mailboxAddress: string | null;
	displayName: string | null;
	connected: boolean;
	status: GoogleSyncStatus | null;
	lastSyncedAt: string | null;
	lastError: string | null;
	autoCreate: boolean;
};

export type ConnectionStatus = {
	id: string;
	hasRefreshToken: boolean;
	sources: SourceStatus[];
};

export type GoogleStatus = {
	configured: boolean;
	connections: ConnectionStatus[];
};

@Injectable()
export class GoogleConnectionService {
	private readonly logger = new Logger(GoogleConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly match: MailboxMatchService,
		private readonly stamp: ActivityStampService,
		private readonly calendar: CalendarClient,
	) {}

	async status(userId: string): Promise<GoogleStatus> {
		await this.onConnected(userId);

		const [rows, accounts] = await Promise.all([
			this.state.listForUser(userId, GOOGLE_SYNC_SOURCES),
			this.tokens.accountsForUser(userId, GOOGLE_PROVIDER_ID),
		]);

		return {
			configured: isGoogleConfigured(),
			connections: await Promise.all(
				accounts.map(async (account): Promise<ConnectionStatus> => {
					const granted = await this.tokens.grantedScopes(account.id);
					const sources = rows
						.filter((row) => row.authAccountId === account.id)
						.map(
							(row): SourceStatus => ({
								id: row.id,
								source: row.source as GoogleSyncSource,
								mailboxAddress: row.mailboxAddress,
								displayName: row.displayName,
								connected: granted.has(
									SCOPE_FOR_SOURCE[row.source as GoogleSyncSource],
								),
								status: row.status,
								lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
								lastError: row.lastError,
								autoCreate: row.autoCreate,
							}),
						);

					return {
						id: account.id,
						hasRefreshToken: Boolean(account.refreshToken),
						sources,
					};
				}),
			),
		};
	}

	async onConnected(userId: string): Promise<void> {
		const accounts = await this.tokens.accountsForUser(
			userId,
			GOOGLE_PROVIDER_ID,
		);
		const added: string[] = [];

		for (const account of accounts) {
			const granted = await this.tokens.grantedScopes(account.id);

			if (granted.has(SCOPE_FOR_SOURCE.gmail)) {
				const row = await this.state.ensure({
					userId,
					authAccountId: account.id,
					source: "gmail",
					externalId: "primary",
					autoCreate: false,
				});

				if (row.createdAt.getTime() === row.updatedAt.getTime()) {
					added.push(`${account.id}:gmail`);
				}
			}

			if (!granted.has(SCOPE_FOR_SOURCE.calendar)) continue;

			const token = await this.tokens.accessTokenForAccount(
				userId,
				account.id,
				SCOPE_FOR_SOURCE.calendar,
				"calendar",
			);
			if (token.outcome !== "ok") continue;

			let pageToken: string | undefined;
			do {
				const calendars = await this.calendar.calendars(
					token.accessToken,
					pageToken,
				);
				if (calendars.outcome !== "ok") break;

				for (const calendar of calendars.data.items ?? []) {
					if (!calendar.id) continue;
					const row = await this.state.ensure({
						userId,
						authAccountId: account.id,
						source: "calendar",
						externalId: calendar.id,
						mailboxAddress: calendar.id.toLowerCase(),
						displayName: calendar.summary ?? null,
						autoCreate: calendar.primary === true,
					});

					if (row.createdAt.getTime() === row.updatedAt.getTime()) {
						added.push(`${account.id}:calendar:${calendar.id}`);
					}
				}

				pageToken = calendars.data.nextPageToken;
			} while (pageToken);
		}

		if (added.length > 0) {
			this.logger.log({ message: "Google connected", userId, sources: added });
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: {
				providerId: GOOGLE_PROVIDER_ID,
				OR: GOOGLE_SYNC_SOURCES.map((source) => ({
					scope: { contains: SCOPE_FOR_SOURCE[source] },
				})),
			},
			select: { userId: true },
		});

		for (const userId of new Set(accounts.map((row) => row.userId))) {
			await this.onConnected(userId);
		}
	}

	async purgeSyncedData(
		userId: string,
		authAccountId: string,
	): Promise<{ purged: number }> {
		const mine: Prisma.EmailMessageWhereInput = {
			syncedByMailbox: { userId, authAccountId },
			gmailMessageId: { not: null },
		};

		const purged = await this.db.$transaction(
			async (tx) => {
				const touched = await tx.emailMessage.findMany({
					where: mine,
					select: { threadId: true },
					distinct: ["threadId"],
				});

				const threadIds = touched.map((row) => row.threadId);
				const messages = await tx.emailMessage.deleteMany({ where: mine });

				await tx.emailThread.deleteMany({
					where: { id: { in: threadIds }, messages: { none: {} } },
				});

				await rebuildThreads(tx, threadIds);

				const events = await tx.calendarEvent.deleteMany({
					where: { syncedByMailbox: { userId, authAccountId } },
				});

				return messages.count + events.count;
			},
			{ timeout: PURGE_TIMEOUT_MS },
		);

		await this.stamp.recomputeAll();

		this.logger.log({ message: "Google data purged", userId, purged });

		return { purged };
	}

	async revoke(
		userId: string,
		authAccountId: string,
	): Promise<{ revoked: boolean }> {
		const revoked = await this.tokens.revoke(userId, authAccountId);
		return { revoked };
	}

	async setAutoCreate(
		userId: string,
		syncId: string,
		enabled: boolean,
	): Promise<void> {
		const row = await this.state.get(syncId);
		if (
			!row ||
			row.userId !== userId ||
			!GOOGLE_SYNC_SOURCES.includes(row.source as GoogleSyncSource)
		) {
			throw new NotFoundException("That Google source is not connected.");
		}

		await this.state.setAutoCreate(userId, syncId, enabled);
	}

	async suppressDomain(
		domain: string,
		options: { reason?: string; purge: boolean },
	): Promise<{ domain: string; purged: number }> {
		const normalised = normalizeDomain(domain);
		if (!normalised) {
			throw new NotFoundException(`"${domain}" is not a domain.`);
		}

		const ours = await this.match.internalIdentity();
		if (ours.domains.has(normalised)) {
			throw new NotFoundException(
				"That is our own domain — it is already excluded.",
			);
		}

		await this.db.suppressedDomain.upsert({
			where: { domain: normalised },
			create: { domain: normalised, reason: options.reason ?? null },
			update: { reason: options.reason ?? null },
		});

		if (!options.purge) return { domain: normalised, purged: 0 };

		const company = await this.db.company.findUnique({
			where: { domain: normalised },
			select: { id: true },
		});

		if (!company) return { domain: normalised, purged: 0 };

		const [threads, events] = await this.db.$transaction([
			this.db.emailThread.deleteMany({ where: { companyId: company.id } }),
			this.db.calendarEvent.deleteMany({ where: { companyId: company.id } }),
		]);

		await this.stamp.recomputeAll();

		this.logger.log({
			message: "Domain suppressed",
			domain: normalised,
			purged: threads.count + events.count,
		});

		return { domain: normalised, purged: threads.count + events.count };
	}
}

async function rebuildThreads(
	tx: Prisma.TransactionClient,
	threadIds: string[],
): Promise<void> {
	if (threadIds.length === 0) return;

	const remaining = await tx.emailMessage.findMany({
		where: { threadId: { in: threadIds } },
		select: { threadId: true, sentAt: true, subject: true, snippet: true },
		orderBy: { sentAt: "asc" },
	});

	const byThread = new Map<string, typeof remaining>();

	for (const message of remaining) {
		const group = byThread.get(message.threadId);
		if (group) group.push(message);
		else byThread.set(message.threadId, [message]);
	}

	for (const [threadId, messages] of byThread) {
		const first = messages.at(0);
		const last = messages.at(-1);
		if (!first || !last) continue;

		await tx.emailThread.update({
			where: { id: threadId },
			data: {
				messageCount: messages.length,
				firstMessageAt: first.sentAt,
				lastMessageAt: last.sentAt,
				subject: first.subject,
			},
		});

		await tx.activity.updateMany({
			where: { emailThreadId: threadId },
			data: { body: last.snippet, occurredAt: last.sentAt },
		});
	}
}
