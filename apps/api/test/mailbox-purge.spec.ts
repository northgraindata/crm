import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, EmailDirection } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { CalendarClient } from "../src/google/calendar.client";
import { GoogleConnectionService } from "../src/google/google-connection.service";
import type { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { MicrosoftConnectionService } from "../src/microsoft/microsoft-connection.service";

const suffix = process.env.TEST_RUN_ID ?? "mailbox-purge-spec";
const userId = `user-${suffix}`;
const domain = `purge-${suffix}.test`;
const rootMessageId = `<root-${suffix}@mail.test>`;
const googleOne = `google-one-${suffix}`;
const googleTwo = `google-two-${suffix}`;
const microsoftOne = `microsoft-one-${suffix}`;
const gmailOne = `gmail-one-${suffix}`;
const gmailTwo = `gmail-two-${suffix}`;
const outlookOne = `outlook-one-${suffix}`;

const tokens = new MailboxTokenService(db);
const state = new SyncStateService(db);
const stamp = new ActivityStampService(db);
const google = new GoogleConnectionService(
	db,
	tokens,
	state,
	{} as MailboxMatchService,
	stamp,
	{} as CalendarClient,
);
const microsoft = new MicrosoftConnectionService(db, tokens, state, stamp);

async function clean(): Promise<void> {
	await db.emailThread.deleteMany({ where: { rootMessageId } });
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { contains: suffix } },
	});
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test User", email: `${userId}@${domain}` },
	});
	await db.account.createMany({
		data: [
			{
				id: googleOne,
				accountId: googleOne,
				providerId: "google",
				userId,
			},
			{
				id: googleTwo,
				accountId: googleTwo,
				providerId: "google",
				userId,
			},
			{
				id: microsoftOne,
				accountId: microsoftOne,
				providerId: "microsoft",
				userId,
			},
		],
	});
	await db.mailboxSync.createMany({
		data: [
			{
				id: gmailOne,
				userId,
				authAccountId: googleOne,
				source: "gmail",
				externalId: "primary",
			},
			{
				id: gmailTwo,
				userId,
				authAccountId: googleTwo,
				source: "gmail",
				externalId: "primary",
			},
			{
				id: outlookOne,
				userId,
				authAccountId: microsoftOne,
				source: "outlook",
				externalId: "primary",
			},
		],
	});
	const company = await db.company.create({
		data: { name: "Purge Test", domain },
	});
	const now = new Date("2026-08-08T12:00:00Z");
	await db.emailThread.create({
		data: {
			rootMessageId,
			subject: "Thread",
			companyId: company.id,
			firstMessageAt: now,
			lastMessageAt: now,
			messageCount: 3,
			messages: {
				create: [
					{
						rfcMessageId: `<g1-${suffix}@mail.test>`,
						direction: EmailDirection.INBOUND,
						fromEmail: `sender@${domain}`,
						recipients: [],
						sentAt: now,
						gmailMessageId: `g1-${suffix}`,
						syncedByUserId: userId,
						syncedByMailboxId: gmailOne,
					},
					{
						rfcMessageId: `<g2-${suffix}@mail.test>`,
						direction: EmailDirection.INBOUND,
						fromEmail: `sender@${domain}`,
						recipients: [],
						sentAt: now,
						gmailMessageId: `g2-${suffix}`,
						syncedByUserId: userId,
						syncedByMailboxId: gmailTwo,
					},
					{
						rfcMessageId: `<m1-${suffix}@mail.test>`,
						direction: EmailDirection.INBOUND,
						fromEmail: `sender@${domain}`,
						recipients: [],
						sentAt: now,
						outlookMessageId: `m1-${suffix}`,
						syncedByUserId: userId,
						syncedByMailboxId: outlookOne,
					},
				],
			},
			activity: {
				create: {
					type: ActivityType.EMAIL,
					subject: "Thread",
					occurredAt: now,
					companyId: company.id,
					createdById: userId,
				},
			},
		},
	});
	await db.calendarEvent.createMany({
		data: [
			{
				iCalUid: `g1-${suffix}`,
				originalStartTime: now,
				startsAt: now,
				endsAt: now,
				status: "confirmed",
				companyId: company.id,
				syncedByUserId: userId,
				syncedByMailboxId: gmailOne,
			},
			{
				iCalUid: `g2-${suffix}`,
				originalStartTime: now,
				startsAt: now,
				endsAt: now,
				status: "confirmed",
				companyId: company.id,
				syncedByUserId: userId,
				syncedByMailboxId: gmailTwo,
			},
		],
	});
});

afterAll(clean);

describe("account-specific mailbox data", () => {
	it("purges one Google account without touching the others", async () => {
		expect(await google.purgeSyncedData(userId, googleOne)).toEqual({
			purged: 2,
		});
		expect(
			await db.emailMessage.count({ where: { syncedByMailboxId: gmailOne } }),
		).toBe(0);
		expect(
			await db.emailMessage.count({ where: { syncedByMailboxId: gmailTwo } }),
		).toBe(1);
		expect(
			await db.emailMessage.count({ where: { syncedByMailboxId: outlookOne } }),
		).toBe(1);
	});

	it("disconnects one provider account and leaves the others connected", async () => {
		expect(await microsoft.revoke(userId, microsoftOne)).toEqual({
			revoked: true,
		});
		expect(await db.account.count({ where: { id: microsoftOne } })).toBe(0);
		expect(await db.account.count({ where: { userId } })).toBe(2);
		expect(await db.mailboxSync.count({ where: { id: outlookOne } })).toBe(0);
	});
});
