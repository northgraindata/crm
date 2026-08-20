import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";

const suffix = process.env.TEST_RUN_ID ?? "deal-contacts-spec";
const userId = `user-${suffix}`;
const domain = `dealpeople-${suffix}.test`;
const otherDomain = `elsewhere-${suffix}.test`;

const deals = new DealsService(
	db,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

let companyId: string;
let otherCompanyId: string;
let dealId: string;
let championId: string;
let colleagueId: string;
let outsiderId: string;

async function clean() {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.contact.deleteMany({
		where: { company: { domain: { in: [domain, otherDomain] } } },
	});
	await db.company.deleteMany({
		where: { domain: { in: [domain, otherDomain] } },
	});
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: userId,
			name: "Deal Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `People Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const other = await db.company.create({
		data: { name: `Other Co ${suffix}`, domain: otherDomain },
		select: { id: true },
	});
	otherCompanyId = other.id;

	const champion = await db.contact.create({
		data: { firstName: "Ada", lastName: "Champion", companyId },
		select: { id: true },
	});
	championId = champion.id;

	const colleague = await db.contact.create({
		data: { firstName: "Beau", lastName: "Colleague", companyId },
		select: { id: true },
	});
	colleagueId = colleague.id;

	const outsider = await db.contact.create({
		data: { firstName: "Cass", lastName: "Outsider", companyId: other.id },
		select: { id: true },
	});
	outsiderId = outsider.id;

	const deal = await deals.create({
		name: `Renewal ${suffix}`,
		companyId,
		ownerId: userId,
	});
	dealId = deal.id;
});

afterAll(clean);

describe("bringing a contact onto a deal", () => {
	it("offers the people at the deal's company and nobody else", async () => {
		const options = await deals.contactOptions(dealId);
		const ids = options.map((option) => option.id);

		expect(ids).toContain(championId);
		expect(ids).toContain(colleagueId);
		expect(ids).not.toContain(outsiderId);
	});

	it("attaches with a role and reads back on the deal", async () => {
		await deals.attachContact({
			dealId,
			contactId: championId,
			role: "Champion",
		});

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(1);
		expect(deal.contacts[0]?.id).toBe(championId);
		expect(deal.contacts[0]?.role).toBe("Champion");
	});

	it("stops offering somebody already on it", async () => {
		const options = await deals.contactOptions(dealId);

		expect(options.map((option) => option.id)).not.toContain(championId);
	});

	it("attaching twice keeps the role it already has", async () => {
		await deals.attachContact({ dealId, contactId: championId });

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(1);
		expect(deal.contacts[0]?.role).toBe("Champion");
	});

	it("refuses somebody who works somewhere else", async () => {
		await expect(
			deals.attachContact({ dealId, contactId: outsiderId }),
		).rejects.toThrow("That contact does not work at a company on this deal.");
	});

	it("blanks a role rather than storing an empty string", async () => {
		await deals.setContactRole({ dealId, contactId: championId, role: "  " });

		const deal = await deals.byId(dealId);

		expect(deal.contacts[0]?.role).toBeNull();
	});

	it("will not set a role on somebody who is not on the deal", async () => {
		await expect(
			deals.setContactRole({
				dealId,
				contactId: colleagueId,
				role: "Blocker",
			}),
		).rejects.toThrow("That contact is not on this deal.");
	});

	it("takes them off again, leaving the contact in the CRM", async () => {
		await deals.detachContact({ dealId, contactId: championId });

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(0);
		expect(await db.contact.count({ where: { id: championId } })).toBe(1);
	});

	it("says so when they were never on it", async () => {
		await expect(
			deals.detachContact({ dealId, contactId: championId }),
		).rejects.toThrow("That contact is not on this deal.");
	});

	it("associates an end client and offers its people", async () => {
		await deals.attachCompany({
			dealId,
			companyId: otherCompanyId,
			role: "END_CLIENT",
		});

		const [deal, options] = await Promise.all([
			deals.byId(dealId),
			deals.contactOptions(dealId),
		]);

		expect(deal.companies).toHaveLength(1);
		expect(deal.companies[0]?.id).toBe(otherCompanyId);
		expect(deal.companies[0]?.role).toBe("END_CLIENT");
		expect(options.map((option) => option.id)).toContain(outsiderId);
	});

	it("attaches somebody from an associated company", async () => {
		await deals.attachContact({
			dealId,
			contactId: outsiderId,
			role: "Hiring manager",
		});

		const deal = await deals.byId(dealId);

		expect(deal.contacts[0]?.id).toBe(outsiderId);
		expect(deal.contacts[0]?.company?.id).toBe(otherCompanyId);
	});

	it("changes an associated company's role", async () => {
		await deals.setCompanyRole({
			dealId,
			companyId: otherCompanyId,
			role: "ASSOCIATED",
		});

		const deal = await deals.byId(dealId);

		expect(deal.companies[0]?.role).toBe("ASSOCIATED");
	});

	it("detaches a company and its people from the deal but not the CRM", async () => {
		const removed = await deals.detachCompany({
			dealId,
			companyId: otherCompanyId,
		});

		const deal = await deals.byId(dealId);

		expect(removed.detachedContacts).toBe(1);
		expect(deal.companies).toHaveLength(0);
		expect(deal.contacts).toHaveLength(0);
		expect(await db.contact.count({ where: { id: outsiderId } })).toBe(1);
	});
});
