export const API_SCOPES = ["crm:read", "crm:write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export type ApiTokenPrincipal = {
	tokenId: string;
	userId: string;
	scopes: readonly string[];
	expiresAt: string | null;
};
