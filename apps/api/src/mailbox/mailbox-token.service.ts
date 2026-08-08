import { auth, parseScopes } from "@crm/auth";
import { type Db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { isSyncSource, SCOPE_FOR_SOURCE } from "./mailbox.constants";

export type TokenFailure =
	| { outcome: "needs-reconnect"; reason: string }
	| { outcome: "not-connected"; reason: string };

export type TokenResult = { outcome: "ok"; accessToken: string } | TokenFailure;

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

@Injectable()
export class MailboxTokenService {
	private readonly logger = new Logger(MailboxTokenService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async accountsForUser(userId: string, providerId?: string) {
		return this.db.account.findMany({
			where: { userId, ...(providerId ? { providerId } : {}) },
			select: {
				id: true,
				accountId: true,
				providerId: true,
				scope: true,
				refreshToken: true,
			},
			orderBy: { createdAt: "asc" },
		});
	}

	async grantedScopes(authAccountId: string): Promise<Set<string>> {
		const account = await this.db.account.findUnique({
			where: { id: authAccountId },
			select: { scope: true },
		});

		return parseScopes(account?.scope);
	}

	async hasRefreshToken(authAccountId: string): Promise<boolean> {
		const account = await this.db.account.findUnique({
			where: { id: authAccountId },
			select: { refreshToken: true },
		});

		return Boolean(account?.refreshToken);
	}

	async accessTokenFor(row: MailboxSync): Promise<TokenResult> {
		if (!isSyncSource(row.source)) {
			return {
				outcome: "not-connected",
				reason: `Unknown connection source ${row.source}.`,
			};
		}

		return this.accessTokenForAccount(
			row.userId,
			row.authAccountId,
			SCOPE_FOR_SOURCE[row.source],
			row.source,
		);
	}

	async accessTokenForAccount(
		userId: string,
		authAccountId: string,
		requiredScope: string,
		source: string,
	): Promise<TokenResult> {
		const account = await this.db.account.findFirst({
			where: { id: authAccountId, userId },
			select: { accountId: true, providerId: true, scope: true },
		});

		if (!account) {
			return {
				outcome: "not-connected",
				reason: "The linked provider account no longer exists.",
			};
		}

		if (!parseScopes(account.scope).has(requiredScope)) {
			return {
				outcome: "not-connected",
				reason: `The ${source} scope has not been granted.`,
			};
		}

		try {
			const { accessToken } = await auth.api.getAccessToken({
				body: {
					providerId: account.providerId,
					accountId: account.accountId,
					userId,
				},
			});

			if (!accessToken) {
				return {
					outcome: "needs-reconnect",
					reason: `${label(account.providerId)} returned no access token.`,
				};
			}

			return { outcome: "ok", accessToken };
		} catch (error) {
			this.logger.warn({
				message: "Connection token refresh failed",
				userId,
				authAccountId,
				providerId: account.providerId,
				source,
				reason: error instanceof Error ? error.message : String(error),
			});

			return {
				outcome: "needs-reconnect",
				reason: `${label(account.providerId)} would not refresh the access token.`,
			};
		}
	}

	async revoke(userId: string, authAccountId: string): Promise<boolean> {
		const account = await this.db.account.findFirst({
			where: { id: authAccountId, userId },
			select: { id: true, accountId: true, providerId: true },
		});

		if (!account) return false;

		if (account.providerId === "google") {
			await this.revokeGoogle(userId, account.accountId);
		}

		await this.db.account.delete({ where: { id: account.id } });

		this.logger.log({
			message: "Provider account disconnected",
			userId,
			authAccountId,
			providerId: account.providerId,
		});

		return true;
	}

	private async revokeGoogle(userId: string, accountId: string): Promise<void> {
		try {
			const { accessToken } = await auth.api.getAccessToken({
				body: { providerId: "google", accountId, userId },
			});
			if (!accessToken) return;

			await fetch(GOOGLE_REVOKE_URL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ token: accessToken }),
			});
		} catch (error) {
			this.logger.warn({
				message: "Google token revocation failed",
				userId,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function label(providerId: string): string {
	if (providerId === "google") return "Google";
	if (providerId === "microsoft") return "Microsoft";
	if (providerId === "zoho") return "Zoho";
	return "The provider";
}
