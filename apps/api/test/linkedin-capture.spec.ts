import { describe, expect, it } from "bun:test";
import { linkedinCaptureInput } from "../src/api-access/linkedin-capture.contracts";
import { LinkedInCaptureService } from "../src/api-access/linkedin-capture.service";

const capture = {
	profileUrl: "https://www.linkedin.com/in/jane-doe",
	firstName: "Jane",
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

	it("does not create a task just because the connection became connected", async () => {
		let taskLookups = 0;
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
				update: async () => ({ id: "contact-1" }),
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
	});
});
