import "@crm/env/load";
import { Injectable } from "@nestjs/common";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";

const mailUrl = () =>
	(process.env.ZOHO_MAIL_URL ?? "https://mail.zoho.eu").replace(/\/+$/, "");

export type ZohoAccount = {
	accountId?: string | number;
	mailboxAddress?: string;
	primaryEmailAddress?: string;
	accountDisplayName?: string;
	displayName?: string;
	type?: string;
	enabled?: boolean;
};

export type ZohoMessage = {
	messageId?: string | number;
	folderId?: string | number;
	threadId?: string | number;
	fromAddress?: string;
	sender?: string;
	toAddress?: string;
	ccAddress?: string;
	subject?: string;
	summary?: string;
	sentDateInGMT?: string | number;
	receivedTime?: string | number;
	receivedtime?: string | number;
};

type ZohoEnvelope<T> = {
	data?: T;
};

@Injectable()
export class ZohoClient {
	constructor(private readonly api: MailboxApiClient) {}

	async accounts(accessToken: string): Promise<MailboxResult<ZohoAccount[]>> {
		const result = await this.api.get<ZohoEnvelope<ZohoAccount[]>>(
			`${mailUrl()}/api/accounts`,
			accessToken,
			{},
			"Zoho-oauthtoken",
		);

		return result.outcome === "ok"
			? { outcome: "ok", data: result.data.data ?? [] }
			: result;
	}

	async messages(
		accessToken: string,
		accountId: string,
		start: number,
	): Promise<MailboxResult<ZohoMessage[]>> {
		const result = await this.api.get<ZohoEnvelope<ZohoMessage[]>>(
			`${mailUrl()}/api/accounts/${encodeURIComponent(accountId)}/messages/view`,
			accessToken,
			{
				start,
				limit: 200,
				sortBy: "date",
				sortorder: false,
				includeto: true,
				includesent: true,
				includearchive: true,
			},
			"Zoho-oauthtoken",
		);

		return result.outcome === "ok"
			? { outcome: "ok", data: result.data.data ?? [] }
			: result;
	}

	async headers(
		accessToken: string,
		accountId: string,
		folderId: string,
		messageId: string,
	): Promise<MailboxResult<string>> {
		const result = await this.api.get<ZohoEnvelope<{ headerContent?: string }>>(
			`${mailUrl()}/api/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/header`,
			accessToken,
			{ raw: true },
			"Zoho-oauthtoken",
		);

		return result.outcome === "ok"
			? { outcome: "ok", data: result.data.data?.headerContent ?? "" }
			: result;
	}

	async content(
		accessToken: string,
		accountId: string,
		folderId: string,
		messageId: string,
	): Promise<MailboxResult<string>> {
		const result = await this.api.get<ZohoEnvelope<{ content?: string }>>(
			`${mailUrl()}/api/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content`,
			accessToken,
			{ includeBlockContent: false },
			"Zoho-oauthtoken",
		);

		return result.outcome === "ok"
			? { outcome: "ok", data: result.data.data?.content ?? "" }
			: result;
	}
}
