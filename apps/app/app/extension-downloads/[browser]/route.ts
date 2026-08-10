import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connection } from "next/server";

const DOWNLOADS: Record<string, string> = {
	chrome: "northgrain-linkedin-chrome.zip",
	safari: "northgrain-linkedin-safari.zip",
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ browser: string }> },
) {
	await connection();
	const { browser } = await params;
	const fileName = DOWNLOADS[browser];
	if (!fileName) return new Response(null, { status: 404 });

	const archive = await readFile(
		resolve(process.cwd(), "public", "downloads", fileName),
	).catch(() => null);
	if (!archive) return new Response(null, { status: 404 });

	return new Response(archive, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Disposition": `attachment; filename="${fileName}"`,
			"Content-Length": String(archive.byteLength),
			"Content-Type": "application/zip",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
