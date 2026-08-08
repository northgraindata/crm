import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	API_SCOPES,
	type ApiScope,
	type ApiTokenPrincipal,
} from "./api-access.constants";

const TOKEN_PREFIX = "crm_pat_";

@Injectable()
export class ApiAccessService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async create(
		userId: string,
		input: {
			name: string;
			scopes: readonly ApiScope[];
			expiresAt?: string | null;
		},
	): Promise<{
		id: string;
		name: string;
		token: string;
		tokenPrefix: string;
		scopes: ApiScope[];
		expiresAt: string | null;
		createdAt: string;
	}> {
		const name = input.name.trim();
		if (!name) throw new BadRequestException("A token needs a name.");

		const scopes = [...new Set(input.scopes)];
		if (scopes.length === 0) {
			throw new BadRequestException("Choose at least one API scope.");
		}
		if (scopes.some((scope) => !API_SCOPES.includes(scope))) {
			throw new BadRequestException("That API scope is not supported.");
		}

		const expiresAt = parseExpiry(input.expiresAt);
		const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
		const tokenHash = hashToken(token);
		const tokenPrefix = token.slice(0, TOKEN_PREFIX.length + 8);
		const row = await this.db.apiToken.create({
			data: {
				id: randomUUID(),
				name,
				tokenHash,
				tokenPrefix,
				scopes,
				userId,
				expiresAt,
			},
		});

		return {
			id: row.id,
			name: row.name,
			token,
			tokenPrefix: row.tokenPrefix,
			scopes: row.scopes as ApiScope[],
			expiresAt: row.expiresAt?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString(),
		};
	}

	async list(userId: string) {
		const rows = await this.db.apiToken.findMany({
			where: { userId, revokedAt: null },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				name: true,
				tokenPrefix: true,
				scopes: true,
				expiresAt: true,
				lastUsedAt: true,
				createdAt: true,
			},
		});

		return rows.map((row) => ({
			...row,
			scopes: row.scopes as ApiScope[],
			expiresAt: row.expiresAt?.toISOString() ?? null,
			lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString(),
		}));
	}

	async revoke(userId: string, id: string): Promise<{ id: string }> {
		const result = await this.db.apiToken.updateMany({
			where: { id, userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		if (result.count === 0)
			throw new NotFoundException("That API token does not exist.");
		return { id };
	}

	async authenticate(rawToken: string | undefined): Promise<ApiTokenPrincipal> {
		if (!rawToken?.startsWith(TOKEN_PREFIX))
			throw new ForbiddenException("A valid API token is required.");

		const token = await this.db.apiToken.findUnique({
			where: { tokenHash: hashToken(rawToken) },
			select: {
				id: true,
				userId: true,
				scopes: true,
				expiresAt: true,
				revokedAt: true,
			},
		});
		if (
			!token ||
			token.revokedAt ||
			(token.expiresAt && token.expiresAt <= new Date())
		) {
			throw new ForbiddenException("That API token is invalid or expired.");
		}

		void this.db.apiToken
			.update({
				where: { id: token.id },
				data: { lastUsedAt: new Date() },
			})
			.catch(() => undefined);

		return { tokenId: token.id, userId: token.userId, scopes: token.scopes };
	}
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function parseExpiry(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime()) || date <= new Date()) {
		throw new BadRequestException("Token expiry must be a future date.");
	}
	return date;
}
