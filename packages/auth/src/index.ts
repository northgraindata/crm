export { type Auth, auth, type Session, type SessionUser } from "./auth";
export { AUTH_COOKIE_PREFIX } from "./cookies";
export {
	isGoogleConfigured,
	isMicrosoftConfigured,
	isZohoConfigured,
} from "./env";
export {
	canChangeRole,
	canManageCurrency,
	canRenameWorkspace,
	DEFAULT_WORKSPACE_NAME,
	ensureWorkspaceMembership,
	isWorkspaceAdmin,
	isWorkspaceRole,
	WORKSPACE_ID,
	WORKSPACE_ROLES,
	type WorkspaceRole,
} from "./organization";
export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	isMailboxProvider,
	MAILBOX_PROVIDER_IDS,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SCOPES,
	OUTLOOK_MAIL_SCOPE,
	parseScopes,
	SYNC_SCOPES,
	SYNC_SCOPES_FOR,
	ZOHO_MAIL_SCOPE,
	ZOHO_PROVIDER_ID,
} from "./scopes";
export { onSignedIn, type SignedInHandler } from "./signed-in";
export {
	canConfigureSso,
	ssoCallbackBase,
	ssoCallbackURL,
	ssoProviderName,
} from "./sso";
export {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
	workspaceDomains,
} from "./workspace";
