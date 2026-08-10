export function publicMediaKey(path: string[]): string | null {
	try {
		const key = path.map((part) => decodeURIComponent(part)).join("/");
		if (!key || key.includes("..") || key.startsWith("team-documents/")) {
			return null;
		}
		return key;
	} catch {
		return null;
	}
}
