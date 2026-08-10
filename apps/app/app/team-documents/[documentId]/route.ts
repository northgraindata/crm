import { db } from "@crm/db";
import { read } from "@crm/db/blob";
import { connection } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ documentId: string }> },
) {
	await connection();
	if (!(await getSession())) {
		return Response.json({ error: "Not signed in." }, { status: 401 });
	}

	const { documentId } = await params;
	const document = await db.teamMemberDocument.findUnique({
		where: { id: documentId },
		select: { fileKey: true, fileName: true, fileType: true },
	});
	if (!document?.fileKey) return new Response(null, { status: 404 });

	const object = await read(document.fileKey);
	if (!object?.body) return new Response(null, { status: 404 });

	const fileName = encodeURIComponent(document.fileName ?? "document");
	return new Response(object.body, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Disposition": `inline; filename*=UTF-8''${fileName}`,
			"Content-Type":
				document.fileType ?? object.contentType ?? "application/octet-stream",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
