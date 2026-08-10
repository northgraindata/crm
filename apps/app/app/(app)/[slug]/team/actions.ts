"use server";

import { randomUUID } from "node:crypto";
import { blobEnabled, remove, write } from "@crm/db/blob";
import { getSession } from "@/lib/session";
import { validateTeamDocumentFile } from "@/lib/team-document-upload";
import { getServerTrpcClient } from "@/lib/trpc/server";

export async function uploadTeamDocumentFile(
	documentId: string,
	formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!(await getSession()))
		return { ok: false, error: "Sign in to upload files." };
	if (!blobEnabled()) {
		return { ok: false, error: "File storage is not configured." };
	}

	const value = formData.get("file");
	if (!(value instanceof File) || value.size === 0) {
		return { ok: false, error: "Choose a file to upload." };
	}

	const validation = validateTeamDocumentFile(value);
	if (!validation.ok) return validation;

	const key = `team-documents/${documentId}/${randomUUID()}.${validation.extension}`;
	const stored = await write(
		key,
		new Uint8Array(await value.arrayBuffer()),
		value.type,
	);
	if (!stored) return { ok: false, error: "The file could not be stored." };

	try {
		await getServerTrpcClient().workManagement.attachDocumentFile.mutate({
			id: documentId,
			fileKey: key,
			fileName: value.name,
			fileType: value.type,
			fileSize: value.size,
		});
		return { ok: true };
	} catch {
		await remove(key);
		return { ok: false, error: "The file could not be attached." };
	}
}
