import { describe, expect, it } from "bun:test";
import {
	contactCreateInput,
	contactListInput,
	contactUpdateArgs,
} from "../src/contacts/contacts.contracts";

const statuses = [
	"TO_RESEARCH",
	"READY_TO_CONTACT",
	"CONTACTED_AWAITING_REPLY",
	"ACTIVE_CONVERSATION",
	"FOLLOW_UP_DUE",
	"NURTURE",
	"CLOSED_IRRELEVANT",
] as const;

describe("contact status contracts", () => {
	it("accepts every current status for create, update, and filtering", () => {
		for (const status of statuses) {
			expect(
				contactCreateInput.parse({ firstName: "Ada", status }).status,
			).toBe(status);
			expect(
				contactUpdateArgs.parse({ id: "contact-1", data: { status } }).data
					.status,
			).toBe(status);
			expect(contactListInput.parse({ status }).status).toBe(status);
		}
	});

	it("rejects legacy statuses while retaining the all filter", () => {
		expect(() =>
			contactCreateInput.parse({ firstName: "Ada", status: "TO_CONTACT" }),
		).toThrow();
		expect(() =>
			contactUpdateArgs.parse({
				id: "contact-1",
				data: { status: "CONTACTED" },
			}),
		).toThrow();
		expect(() => contactListInput.parse({ status: "TO_CONTACT" })).toThrow();
		expect(contactListInput.parse({ status: "all" }).status).toBe("all");
	});
});
