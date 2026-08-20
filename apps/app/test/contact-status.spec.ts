import { describe, expect, it } from "bun:test";
import {
	CONTACT_STATUS_OPTIONS,
	contactStatusPresentation,
} from "../lib/contact-status";

describe("contact statuses", () => {
	it("presents the relationship pipeline in working order", () => {
		expect(
			CONTACT_STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
		).toEqual([
			{ value: "TO_RESEARCH", label: "To research" },
			{ value: "READY_TO_CONTACT", label: "Ready to contact" },
			{
				value: "CONTACTED_AWAITING_REPLY",
				label: "Contacted — awaiting reply",
			},
			{ value: "ACTIVE_CONVERSATION", label: "Active conversation" },
			{ value: "FOLLOW_UP_DUE", label: "Follow-up due" },
			{ value: "NURTURE", label: "Nurture" },
			{ value: "CLOSED_IRRELEVANT", label: "Closed / irrelevant" },
		]);
	});

	it("uses the same presentation in tables and record sheets", () => {
		expect(contactStatusPresentation("READY_TO_CONTACT")?.label).toBe(
			"Ready to contact",
		);
		expect(contactStatusPresentation("ACTIVE_CONVERSATION")?.tone).toBe(
			"primary",
		);
	});
});
