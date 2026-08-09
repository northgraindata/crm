import { describe, expect, it } from "bun:test";
import { linkedinCaptureInput } from "../src/api-access/linkedin-capture.contracts";

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
});
