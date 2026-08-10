import { describe, expect, it } from "bun:test";
import {
	MAX_TEAM_DOCUMENT_BYTES,
	validateTeamDocumentFile,
} from "../lib/team-document-upload";

describe("team document uploads", () => {
	it("accepts PDFs and document photos", () => {
		expect(
			validateTeamDocumentFile({ type: "application/pdf", size: 1024 }),
		).toEqual({ ok: true, extension: "pdf" });
		expect(
			validateTeamDocumentFile({ type: "image/heic", size: 1024 }),
		).toEqual({ ok: true, extension: "heic" });
	});

	it("rejects active and unknown formats", () => {
		expect(
			validateTeamDocumentFile({ type: "image/svg+xml", size: 1024 }),
		).toEqual({
			ok: false,
			error: "Use a PDF, JPEG, PNG, WebP or HEIC file.",
		});
	});

	it("rejects empty and oversized files", () => {
		expect(validateTeamDocumentFile({ type: "image/jpeg", size: 0 })).toEqual({
			ok: false,
			error: "Choose a file to upload.",
		});
		expect(
			validateTeamDocumentFile({
				type: "image/jpeg",
				size: MAX_TEAM_DOCUMENT_BYTES + 1,
			}),
		).toEqual({
			ok: false,
			error: "The file must be 10 MB or smaller.",
		});
	});
});
