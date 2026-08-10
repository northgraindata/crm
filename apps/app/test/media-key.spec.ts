import { describe, expect, it } from "bun:test";
import { publicMediaKey } from "../lib/media-key";

describe("public media keys", () => {
	it("serves ordinary mirrored images", () => {
		expect(publicMediaKey(["companies", "logo.png"])).toBe(
			"companies/logo.png",
		);
	});

	it("never serves private team documents", () => {
		expect(publicMediaKey(["team-documents", "member", "contract.pdf"])).toBe(
			null,
		);
		expect(publicMediaKey(["%74eam-documents", "contract.pdf"])).toBe(null);
	});

	it("rejects traversal and empty keys", () => {
		expect(publicMediaKey(["..", "secret"])).toBe(null);
		expect(publicMediaKey([])).toBe(null);
	});
});
