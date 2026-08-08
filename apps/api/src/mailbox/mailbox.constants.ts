import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
	ZOHO_MAIL_SCOPE,
	ZOHO_PROVIDER_ID,
} from "@crm/auth";

export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SCOPES,
	OUTLOOK_MAIL_SCOPE,
	SYNC_SCOPES,
	ZOHO_MAIL_SCOPE,
	ZOHO_PROVIDER_ID,
} from "@crm/auth";

export const SYNC_SOURCES = ["calendar", "gmail", "outlook", "zoho"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export const GOOGLE_SYNC_SOURCES = ["calendar", "gmail"] as const;
export const MICROSOFT_SYNC_SOURCES = ["outlook"] as const;
export const ZOHO_SYNC_SOURCES = ["zoho"] as const;

export type GoogleSyncSource = (typeof GOOGLE_SYNC_SOURCES)[number];
export type MicrosoftSyncSource = (typeof MICROSOFT_SYNC_SOURCES)[number];
export type ZohoSyncSource = (typeof ZOHO_SYNC_SOURCES)[number];

export function isGoogleSyncSource(source: string): source is GoogleSyncSource {
	return (GOOGLE_SYNC_SOURCES as readonly string[]).includes(source);
}

export function isMicrosoftSyncSource(
	source: string,
): source is MicrosoftSyncSource {
	return (MICROSOFT_SYNC_SOURCES as readonly string[]).includes(source);
}

export function isZohoSyncSource(source: string): source is ZohoSyncSource {
	return (ZOHO_SYNC_SOURCES as readonly string[]).includes(source);
}

export function isSyncSource(source: string): source is SyncSource {
	return (SYNC_SOURCES as readonly string[]).includes(source);
}

export const SCOPE_FOR_SOURCE: Record<SyncSource, string> = {
	calendar: CALENDAR_SCOPE,
	gmail: GMAIL_SCOPE,
	outlook: OUTLOOK_MAIL_SCOPE,
	zoho: ZOHO_MAIL_SCOPE,
};

export const PROVIDER_FOR_SOURCE: Record<SyncSource, MailboxProviderId> = {
	calendar: GOOGLE_PROVIDER_ID,
	gmail: GOOGLE_PROVIDER_ID,
	outlook: MICROSOFT_PROVIDER_ID,
	zoho: ZOHO_PROVIDER_ID,
};
