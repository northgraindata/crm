import { read } from "@crm/db/blob";
import { NextResponse } from "next/server";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;
	const key = path.map((part) => decodeURIComponent(part)).join("/");
	if (!key || key.includes(".."))
		return new NextResponse(null, { status: 404 });

	const object = await read(key);
	if (!object?.body) return new NextResponse(null, { status: 404 });

	return new NextResponse(object.body, {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": object.contentType ?? "application/octet-stream",
		},
	});
}
