import { sso } from "@better-auth/sso";
import { db } from "@crm/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { organization } from "better-auth/plugins/organization";
import { AUTH_COOKIE_PREFIX } from "./cookies";
import { env } from "./env";
import { ensureWorkspaceMembership } from "./organization";
import {
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	ZOHO_PROVIDER_ID,
} from "./scopes";
import { notifySignedIn } from "./signed-in";
import {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
} from "./workspace";

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

if (env.google) {
	socialProviders.google = {
		...env.google,
		accessType: "offline",
		prompt: "select_account consent",

		...(primaryWorkspaceDomain() ? { hd: primaryWorkspaceDomain() } : {}),
	};
}

if (env.microsoft) {
	socialProviders.microsoft = {
		clientId: env.microsoft.clientId,
		clientSecret: env.microsoft.clientSecret,
		tenantId: env.microsoft.tenantId,

		prompt: "select_account",

		disableProfilePhoto: true,

		mapProfileToUser: (profile) => ({
			email: profile.email ?? profile.preferred_username ?? profile.upn,
		}),
	};
}

const zoho = env.zoho;
const zohoOAuth = genericOAuth({
	config: zoho
		? [
				{
					providerId: ZOHO_PROVIDER_ID,
					clientId: zoho.clientId,
					clientSecret: zoho.clientSecret,
					authorizationUrl: `${zoho.accountsUrl}/oauth/v2/auth`,
					tokenUrl: `${zoho.accountsUrl}/oauth/v2/token`,
					scopes: ["ZohoMail.accounts.READ", "ZohoMail.messages.READ"],
					accessType: "offline",
					prompt: "consent",
					authentication: "post",
					getUserInfo: async (tokens) => {
						const response = await fetch(`${zoho.mailUrl}/api/accounts`, {
							headers: {
								authorization: `Zoho-oauthtoken ${tokens.accessToken}`,
							},
						});

						if (!response.ok) return null;

						const body = (await response.json()) as {
							data?: Array<{
								zuid?: string | number;
								accountId?: string | number;
								primaryEmailAddress?: string;
								mailboxAddress?: string;
								displayName?: string;
								accountDisplayName?: string;
								type?: string;
							}>;
						};

						const account =
							body.data?.find((entry) => entry.type === "ZOHO_ACCOUNT") ??
							body.data?.[0];
						const email =
							account?.primaryEmailAddress ?? account?.mailboxAddress;
						const id = account?.zuid ?? account?.accountId;

						if (!id || !email) return null;

						return {
							id: String(id),
							email,
							emailVerified: true,
							name:
								account?.displayName ?? account?.accountDisplayName ?? email,
						};
					},
				},
			]
		: [],
});

export const auth = betterAuth({
	appName: "CRM",
	baseURL: env.apiUrl,

	database: prismaAdapter(db, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: true,
	},

	socialProviders,

	account: {
		encryptOAuthTokens: true,
		accountLinking: {
			enabled: true,
			disableImplicitLinking: true,
			allowDifferentEmails: true,
			trustedProviders: [
				GOOGLE_PROVIDER_ID,
				MICROSOFT_PROVIDER_ID,
				ZOHO_PROVIDER_ID,
			],
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
	},

	advanced: {
		cookiePrefix: AUTH_COOKIE_PREFIX,

		useSecureCookies: env.isProduction,
		...(env.cookieDomain && {
			crossSubDomainCookies: {
				enabled: true,
				domain: env.cookieDomain,
			},
		}),
	},

	trustedOrigins: [...env.trustedOrigins],
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/sign-in/social" || ctx.path === "/sign-in/oauth2") {
				throw new APIError("FORBIDDEN", {
					message:
						"Mail and calendar providers can only be connected from Settings.",
				});
			}
		}),
	},

	plugins: [
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			creatorRole: "owner",

			schema: {
				organization: {
					additionalFields: {
						website: {
							type: "string",
							required: false,
						},
					},
				},
			},
		}),

		sso({
			organizationProvisioning: { disabled: true },
		}),

		zohoOAuth,
	],

	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (!hasSignInAllowList()) {
						throw new APIError("FORBIDDEN", {
							message:
								'No one can sign in yet: set ALLOWED_SIGN_IN in .env to your email domain (for example ALLOWED_SIGN_IN="acme.com") and restart.',
						});
					}

					if (!isWorkspaceEmail(user.email)) {
						const domain = primaryWorkspaceDomain();
						throw new APIError("FORBIDDEN", {
							message: domain
								? `This CRM is private. Sign in with your @${domain} account.`
								: "This CRM is private. That address is not on the allow-list.",
						});
					}

					return { data: user };
				},
			},
		},

		session: {
			create: {
				before: async (session) => {
					const workspaceId = await ensureWorkspaceMembership(session.userId);

					return {
						data: { ...session, activeOrganizationId: workspaceId ?? null },
					};
				},

				after: async (session) => {
					const user = await db.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});

					if (user) await notifySignedIn(user);
				},
			},
		},
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
