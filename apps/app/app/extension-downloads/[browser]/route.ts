import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { connection } from "next/server";

const DOWNLOADS: Record<string, string> = {
	chrome: "northgrain-linkedin-chrome.zip",
	safari: "northgrain-linkedin-safari.zip",
};

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ browser: string }> },
) {
	await connection();
	const { browser } = await params;
	if (browser === "metadata") {
		const archive = await readFile(
			resolve(
				process.cwd(),
				"public",
				"downloads",
				"northgrain-linkedin-chrome.zip",
			),
		);
		const manifestFile = unzipSync(new Uint8Array(archive))["manifest.json"];
		if (!manifestFile) return new Response(null, { status: 404 });
		const manifest = JSON.parse(strFromU8(manifestFile)) as { version: string };
		return Response.json(
			{
				latestVersion: manifest.version,
				minimumCompatibleVersion: manifest.version,
				downloadUrl: new URL("/extension-downloads/chrome", request.url).href,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	}
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
