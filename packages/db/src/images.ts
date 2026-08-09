export const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

function storageUrl(): URL | null {
	const value = process.env.STORAGE_PUBLIC_URL?.trim();
	if (!value) return null;
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

export const COMPANY_IMAGE_FIELDS = [
	"logoUrl",
	"logoDarkUrl",
	"iconUrl",
	"iconDarkUrl",
] as const;

export type CompanyImageField = (typeof COMPANY_IMAGE_FIELDS)[number];

const OPTIMIZABLE = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

export function isMirrored(url: string | null | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		if (parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return true;
		const storage = storageUrl();
		return (
			storage !== null &&
			parsed.origin === storage.origin &&
			parsed.pathname.startsWith(`${storage.pathname.replace(/\/$/, "")}/`)
		);
	} catch {
		return false;
	}
}

export function isOptimizable(url: string | null | undefined): boolean {
	if (!isMirrored(url) || !url) return false;

	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return false;
		const extension = parsed.pathname.split(".").pop()?.toLowerCase();
		return extension !== undefined && OPTIMIZABLE.has(extension);
	} catch {
		return false;
	}
}
