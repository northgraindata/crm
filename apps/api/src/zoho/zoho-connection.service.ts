import { isZohoConfigured } from "@crm/auth";
import { type Db, GoogleSyncStatus } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import { ZohoClient } from "./zoho.client";
import {
	ZOHO_MAIL_SCOPE,
	ZOHO_PROVIDER_ID,
	ZOHO_SYNC_SOURCES,
} from "./zoho.constants";

export type ZohoSourceStatus = {
	id: string;
	source: "zoho";
	mailboxAddress: string | null;
	displayName: string | null;
	connected: boolean;
	status: GoogleSyncStatus | null;
	lastSyncedAt: string | null;
	lastError: string | null;
	autoCreate: boolean;
};

export type ZohoStatus = {
	configured: boolean;
	connections: Array<{
		id: string;
		hasRefreshToken: boolean;
		sources: ZohoSourceStatus[];
	}>;
};

@Injectable()
export class ZohoConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly zoho: ZohoClient,
	) {}

	async status(userId: string): Promise<ZohoStatus> {
		await this.onConnected(userId);

		const [accounts, rows] = await Promise.all([
			this.tokens.accountsForUser(userId, ZOHO_PROVIDER_ID),
			this.state.listForUser(userId, ZOHO_SYNC_SOURCES),
		]);

		return {
			configured: isZohoConfigured(),
			connections: await Promise.all(
				accounts.map(async (account) => {
					const granted = await this.tokens.grantedScopes(account.id);
					return {
						id: account.id,
						hasRefreshToken: Boolean(account.refreshToken),
						sources: rows
							.filter((row) => row.authAccountId === account.id)
							.map(
								(row): ZohoSourceStatus => ({
									id: row.id,
									source: "zoho",
									mailboxAddress: row.mailboxAddress,
									displayName: row.displayName,
									connected: granted.has(ZOHO_MAIL_SCOPE),
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
			ZOHO_PROVIDER_ID,
		);

		for (const account of accounts) {
			const token = await this.tokens.accessTokenForAccount(
				userId,
				account.id,
				ZOHO_MAIL_SCOPE,
				"zoho",
			);
			if (token.outcome !== "ok") continue;

			const result = await this.zoho.accounts(token.accessToken);
			if (result.outcome !== "ok") continue;

			for (const mailbox of result.data) {
				const externalId = String(mailbox.accountId ?? "");
				const mailboxAddress =
					mailbox.primaryEmailAddress ?? mailbox.mailboxAddress ?? null;
				if (!externalId || !mailboxAddress || mailbox.enabled === false)
					continue;

				await this.state.ensure({
					userId,
					authAccountId: account.id,
					source: "zoho",
					externalId,
					mailboxAddress: mailboxAddress.toLowerCase(),
					displayName:
						mailbox.displayName ?? mailbox.accountDisplayName ?? null,
					autoCreate: false,
				});
			}
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: { providerId: ZOHO_PROVIDER_ID },
			select: { userId: true },
		});

		for (const userId of new Set(accounts.map((row) => row.userId))) {
			await this.onConnected(userId);
		}
	}

	async revoke(
		userId: string,
		authAccountId: string,
	): Promise<{ revoked: boolean }> {
		return { revoked: await this.tokens.revoke(userId, authAccountId) };
	}

	async setAutoCreate(
		userId: string,
		syncId: string,
		enabled: boolean,
	): Promise<void> {
		const row = await this.state.get(syncId);
		if (!row || row.userId !== userId || row.source !== "zoho") {
			throw new NotFoundException("That Zoho mailbox is not connected.");
		}

		await this.state.setAutoCreate(userId, syncId, enabled);
	}
}
