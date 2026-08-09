import "@crm/env/load";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_MICROSOFT_TENANT = "common";
const DEFAULT_ZOHO_ACCOUNTS_URL = "https://accounts.zoho.eu";
const DEFAULT_ZOHO_MAIL_URL = "https://mail.zoho.eu";

const optional = (key: string): string | undefined => {
	const value = process.env[key];
	return value && value.length > 0 ? value : undefined;
};

const pair = (
	idKey: string,
	secretKey: string,
): { clientId: string; clientSecret: string } | undefined => {
	const clientId = optional(idKey);
	const clientSecret = optional(secretKey);

	if (!clientId || !clientSecret) {
		if (clientId || clientSecret) {
			throw new Error(`${idKey} and ${secretKey} must be set together.`);
		}
		return undefined;
	}

	return { clientId, clientSecret };
};

const googleCredentials = ():
	| { clientId: string; clientSecret: string }
	| undefined => pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");

const microsoftCredentials = ():
	| { clientId: string; clientSecret: string; tenantId: string }
	| undefined => {
	const credentials = pair("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET");
	if (!credentials) return undefined;

	return {
		...credentials,
		tenantId: optional("MICROSOFT_TENANT_ID") ?? DEFAULT_MICROSOFT_TENANT,
	};
};

const zohoCredentials = ():
	| {
			clientId: string;
			clientSecret: string;
			accountsUrl: string;
			mailUrl: string;
	  }
	| undefined => {
	const credentials = pair("ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET");
	if (!credentials) return undefined;

	return {
		...credentials,
		accountsUrl: optional("ZOHO_ACCOUNTS_URL") ?? DEFAULT_ZOHO_ACCOUNTS_URL,
		mailUrl: optional("ZOHO_MAIL_URL") ?? DEFAULT_ZOHO_MAIL_URL,
	};
};

const apiUrl =
	optional("PUBLIC_API_URL") ??
	optional("BETTER_AUTH_URL") ??
	optional("API_URL") ??
	DEFAULT_API_URL;

const appUrls = (optional("APP_URL") ?? DEFAULT_APP_URL)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const appUrl = appUrls[0] ?? DEFAULT_APP_URL;

export const env = {
	apiUrl,
	appUrl,
	google: googleCredentials(),
	microsoft: microsoftCredentials(),
	zoho: zohoCredentials(),
	cookieDomain: optional("AUTH_COOKIE_DOMAIN"),
	trustedOrigins: [...new Set([...appUrls, apiUrl])],
	isProduction: process.env.NODE_ENV === "production",
} as const;

export function isGoogleConfigured(): boolean {
	return env.google !== undefined;
}

export function isMicrosoftConfigured(): boolean {
	return env.microsoft !== undefined;
}

export function isZohoConfigured(): boolean {
	return env.zoho !== undefined;
}

export { apiUrl, appUrl };
