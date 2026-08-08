import { isMicrosoftConfigured } from "@crm/auth";
import { type Db, GoogleSyncStatus, type Prisma } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SOURCES,
	type MicrosoftSyncSource,
	SCOPE_FOR_SOURCE,
} from "./microsoft.constants";

const PURGE_TIMEOUT_MS = 60_000;

export type SourceStatus = {
	id: string;
	source: MicrosoftSyncSource;
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

export type MicrosoftStatus = {
	configured: boolean;
	connections: ConnectionStatus[];
};

@Injectable()
export class MicrosoftConnectionService {
	private readonly logger = new Logger(MicrosoftConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(userId: string): Promise<MicrosoftStatus> {
		await this.onConnected(userId);

		const [rows, accounts] = await Promise.all([
			this.state.listForUser(userId, MICROSOFT_SYNC_SOURCES),
			this.tokens.accountsForUser(userId, MICROSOFT_PROVIDER_ID),
		]);

		return {
			configured: isMicrosoftConfigured(),
			connections: await Promise.all(
				accounts.map(async (account): Promise<ConnectionStatus> => {
					const granted = await this.tokens.grantedScopes(account.id);
					return {
						id: account.id,
						hasRefreshToken: Boolean(account.refreshToken),
						sources: rows
							.filter((row) => row.authAccountId === account.id)
							.map(
								(row): SourceStatus => ({
									id: row.id,
									source: row.source as MicrosoftSyncSource,
									mailboxAddress: row.mailboxAddress,
									displayName: row.displayName,
									connected: granted.has(SCOPE_FOR_SOURCE.outlook),
									status: row.status,
									lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
									lastError: row.lastError,
									autoCreate: row.autoCreate,
								}),
							),
					};
				}),
			),
		};
	}

	async onConnected(userId: string): Promise<void> {
		const accounts = await this.tokens.accountsForUser(
			userId,
			MICROSOFT_PROVIDER_ID,
		);
		const added: string[] = [];

		for (const account of accounts) {
			const granted = await this.tokens.grantedScopes(account.id);
			if (!granted.has(SCOPE_FOR_SOURCE.outlook)) continue;

			const row = await this.state.ensure({
				userId,
				authAccountId: account.id,
				source: "outlook",
				externalId: "primary",
				autoCreate: false,
			});

			if (row.createdAt.getTime() === row.updatedAt.getTime()) {
				added.push(account.id);
			}
		}

		if (added.length > 0) {
			this.logger.log({
				message: "Microsoft connected",
				userId,
				sources: added,
			});
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: {
				providerId: MICROSOFT_PROVIDER_ID,
				OR: MICROSOFT_SYNC_SOURCES.map((source) => ({
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
			outlookMessageId: { not: null },
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

				return messages.count;
			},
			{ timeout: PURGE_TIMEOUT_MS },
		);

		await this.stamp.recomputeAll();

		this.logger.log({ message: "Outlook data purged", userId, purged });

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
		if (!row || row.userId !== userId || row.source !== "outlook") {
			throw new NotFoundException("That Outlook source is not connected.");
		}

		await this.state.setAutoCreate(userId, syncId, enabled);
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
