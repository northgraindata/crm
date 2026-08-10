import { createHash } from "node:crypto";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { isMirrored } from "./images";
import { safeFetch } from "./safe-fetch";

export { isMirrored, isOptimizable } from "./images";

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

let client: S3Client | null = null;

const ALLOWED: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/avif": "avif",
	"image/svg+xml": "svg",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

export function blobEnabled(): boolean {
	return Boolean(
		process.env.STORAGE_ENDPOINT?.trim() &&
			process.env.STORAGE_BUCKET?.trim() &&
			process.env.STORAGE_ACCESS_KEY_ID?.trim() &&
			process.env.STORAGE_SECRET_ACCESS_KEY?.trim() &&
			process.env.STORAGE_PUBLIC_URL?.trim(),
	);
}

export async function mirror(
	sourceUrl: string,
	prefix: string,
): Promise<string | null> {
	if (!blobEnabled()) return null;
	if (isMirrored(sourceUrl)) return sourceUrl;

	try {
		const result = await safeFetch(sourceUrl, { timeoutMs: TIMEOUT_MS });
		if (!result?.response.ok) return null;

		const { response } = result;
		const type = response.headers.get("content-type")?.split(";")[0]?.trim();
		const extension = type ? ALLOWED[type.toLowerCase()] : undefined;
		if (!type || !extension) return null;

		const bytes = await readCapped(response);
		if (!bytes) return null;

		const digest = createHash("sha256")
			.update(bytes)
			.digest("hex")
			.slice(0, 12);

		const key = `${prefix}-${digest}.${extension}`;
		await storageClient().send(
			new PutObjectCommand({
				Bucket: process.env.STORAGE_BUCKET,
				Key: key,
				Body: bytes,
				ContentType: type,
				CacheControl: "public, max-age=31536000, immutable",
			}),
		);

		return `${process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
	} catch {
		return null;
	}
}

export async function read(key: string): Promise<{
	body: ReadableStream<Uint8Array> | null;
	contentType: string | undefined;
} | null> {
	if (!blobEnabled()) return null;

	try {
		const result = await storageClient().send(
			new GetObjectCommand({
				Bucket: process.env.STORAGE_BUCKET,
				Key: key,
			}),
		);
		return {
			body: result.Body?.transformToWebStream() as ReadableStream<Uint8Array> | null,
			contentType: result.ContentType,
		};
	} catch {
		return null;
	}
}

export async function write(
	key: string,
	body: Uint8Array,
	contentType: string,
): Promise<boolean> {
	if (!blobEnabled()) return false;

	try {
		await storageClient().send(
			new PutObjectCommand({
				Bucket: process.env.STORAGE_BUCKET,
				Key: key,
				Body: body,
				ContentType: contentType,
			}),
		);
		return true;
	} catch {
		return false;
	}
}

export async function remove(key: string): Promise<boolean> {
	if (!blobEnabled()) return false;

	try {
		await storageClient().send(
			new DeleteObjectCommand({
				Bucket: process.env.STORAGE_BUCKET,
				Key: key,
			}),
		);
		return true;
	} catch {
		return false;
	}
}

function storageClient(): S3Client {
	if (!client) {
		client = new S3Client({
			endpoint: process.env.STORAGE_ENDPOINT,
			region: process.env.STORAGE_REGION ?? "us-east-1",
			forcePathStyle: true,
			credentials: {
				accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
			},
		});
	}
	return client;
}

async function readCapped(response: Response): Promise<Buffer | null> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_BYTES) {
		await response.body?.cancel();
		return null;
	}

	if (!response.body) return null;

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	try {
		while (size <= MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			chunks.push(value);
		}
	} catch {
		return null;
	} finally {
		await reader.cancel().catch(() => {});
	}

	if (size === 0 || size > MAX_BYTES) return null;
	return Buffer.concat(chunks);
}
