export const MAX_TEAM_DOCUMENT_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
	"application/pdf": "pdf",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
	"image/heif": "heif",
};

export const TEAM_DOCUMENT_ACCEPT = Object.keys(EXTENSIONS).join(",");

export function validateTeamDocumentFile(file: {
	type: string;
	size: number;
}): { ok: true; extension: string } | { ok: false; error: string } {
	const extension = EXTENSIONS[file.type];
	if (!extension) {
		return { ok: false, error: "Use a PDF, JPEG, PNG, WebP or HEIC file." };
	}
	if (file.size <= 0) return { ok: false, error: "Choose a file to upload." };
	if (file.size > MAX_TEAM_DOCUMENT_BYTES) {
		return { ok: false, error: "The file must be 10 MB or smaller." };
	}
	return { ok: true, extension };
}
