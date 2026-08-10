import { describe, expect, it } from "bun:test";
import { linkedinCaptureInput } from "../src/api-access/linkedin-capture.contracts";
import { LinkedInCaptureService } from "../src/api-access/linkedin-capture.service";

const capture = {
	profileUrl: "https://www.linkedin.com/in/jane-doe",
	firstName: "Jane",
	imageUrl: "https://media.licdn.com/profile.jpg",
	reason: "Relationship",
};

describe("LinkedIn capture", () => {
	it("does not create a follow-up unless the rep asks for one", () => {
		expect(linkedinCaptureInput.parse(capture).createFollowUp).toBe(false);
	});

	it("preserves an explicit follow-up choice", () => {
		expect(
			linkedinCaptureInput.parse({ ...capture, createFollowUp: true })
				.createFollowUp,
		).toBe(true);
	});

	it("accepts an email captured from the profile", () => {
		expect(
			linkedinCaptureInput.parse({ ...capture, email: "jane@example.com" })
				.email,
		).toBe("jane@example.com");
	});

	it("does not create a task just because the connection became connected", async () => {
		let taskLookups = 0;
		const updated: { status?: unknown; ownerId?: unknown } = {};
		const service = new LinkedInCaptureService(
			{
				contact: {
					findFirst: async () => ({ id: "contact-1", companyId: null }),
				},
				activity: {
					findFirst: async () => {
						taskLookups += 1;
						return null;
					},
				},
			} as never,
			{} as never,
			{
				update: async (_id: string, input: Record<string, unknown>) => {
					Object.assign(updated, input);
					return { id: "contact-1" };
				},
			} as never,
			{
				valuesFor: async () => ({
					linkedin_connection_status: "linkedin-status-invited-us",
				}),
			} as never,
			{
				backfill: async () => undefined,
			} as never,
		);

		const result = await service.capture(
			linkedinCaptureInput.parse({
				...capture,
				connectionStatus: "connected",
				createFollowUp: false,
			}),
			"user-1",
		);

		expect(result.transitioned).toBe(true);
		expect(result.taskId).toBeNull();
		expect(taskLookups).toBe(0);
		expect(updated.status).toBeUndefined();
		expect(updated.ownerId).toBeUndefined();
	});

	it("marks a newly captured contact as to contact", async () => {
		const created: {
			status?: unknown;
			ownerId?: unknown;
			imageUrl?: unknown;
			email?: unknown;
		} = {};
		const service = new LinkedInCaptureService(
			{
				contact: { findFirst: async () => null },
				activity: { findFirst: async () => null },
			} as never,
			{} as never,
			{
				create: async (input: Record<string, unknown>) => {
					Object.assign(created, input);
					return { id: "contact-1" };
				},
				update: async () => ({ id: "contact-1" }),
			} as never,
			{ valuesFor: async () => ({}) } as never,
			{ backfill: async () => undefined } as never,
		);

		await service.capture(
			linkedinCaptureInput.parse({ ...capture, email: "jane@example.com" }),
			"user-1",
		);

		expect(created.status).toBe("TO_CONTACT");
		expect(created.ownerId).toBe("user-1");
		expect(created.imageUrl).toBe(capture.imageUrl);
		expect(created.email).toBe("jane@example.com");
	});
});
