export const GOOGLE_PROVIDER_ID = "google";
export const MICROSOFT_PROVIDER_ID = "microsoft";
export const ZOHO_PROVIDER_ID = "zoho";

export const MAILBOX_PROVIDER_IDS = [
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	ZOHO_PROVIDER_ID,
] as const;

export type MailboxProviderId = (typeof MAILBOX_PROVIDER_IDS)[number];

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CALENDAR_SCOPE =
	"https://www.googleapis.com/auth/calendar.readonly";
export const OUTLOOK_MAIL_SCOPE = "Mail.Read";
export const ZOHO_MAIL_SCOPE = "ZohoMail.messages.READ";

export const SYNC_SCOPES = [GMAIL_SCOPE, CALENDAR_SCOPE] as const;
export const MICROSOFT_SYNC_SCOPES = [OUTLOOK_MAIL_SCOPE] as const;

export const SYNC_SCOPES_FOR: Record<MailboxProviderId, readonly string[]> = {
	[GOOGLE_PROVIDER_ID]: SYNC_SCOPES,
	[MICROSOFT_PROVIDER_ID]: MICROSOFT_SYNC_SCOPES,
	[ZOHO_PROVIDER_ID]: [ZOHO_MAIL_SCOPE],
};

const GRAPH_SCOPE_PREFIX = "https://graph.microsoft.com/";

export function isMailboxProvider(
	providerId: string,
): providerId is MailboxProviderId {
	return (MAILBOX_PROVIDER_IDS as readonly string[]).includes(providerId);
}

export function parseScopes(scope: string | null | undefined): Set<string> {
	return new Set(
		(scope ?? "")
			.split(/[,\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) =>
				entry.startsWith(GRAPH_SCOPE_PREFIX)
					? entry.slice(GRAPH_SCOPE_PREFIX.length)
					: entry,
			),
	);
}
