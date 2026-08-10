import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { loadRootEnv } from "@crm/env";
import { strToU8, zipSync } from "fflate";

type ArchiveFiles = Record<string, Uint8Array>;

const LOCAL_API_URL = "http://localhost:3001";

export function linkedinExtensionApiUrl({
	nodeEnvironment,
	publicApiUrl,
}: {
	nodeEnvironment: string | undefined;
	publicApiUrl: string | undefined;
}): string {
	return nodeEnvironment === "production" && publicApiUrl
		? publicApiUrl
		: LOCAL_API_URL;
}

async function archiveFiles(
	directory: string,
	root = directory,
): Promise<ArchiveFiles> {
	const files: ArchiveFiles = {};

	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			Object.assign(files, await archiveFiles(path, root));
			continue;
		}

		files[relative(root, path)] = new Uint8Array(await readFile(path));
	}

	return files;
}

export async function packageLinkedinExtension({
	sourceDirectory,
	outputDirectory,
	apiUrl,
}: {
	sourceDirectory: string;
	outputDirectory: string;
	apiUrl: string;
}): Promise<void> {
	const files = await archiveFiles(sourceDirectory);
	files["config.js"] = strToU8(
		`globalThis.NORTHGRAIN_EXTENSION_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)} };\n`,
	);

	const archive = zipSync(files, { level: 9 });
	await mkdir(outputDirectory, { recursive: true });

	await Promise.all(
		[
			"northgrain-linkedin-chrome.zip",
			"northgrain-linkedin-safari.zip",
			"northgrain-linkedin-extension.zip",
		].map((name) => writeFile(join(outputDirectory, name), archive)),
	);
}

if (import.meta.main) {
	loadRootEnv();

	const sourceDirectory = resolve(import.meta.dir, "../../linkedin-extension");
	const outputDirectory = resolve(import.meta.dir, "../public/downloads");
	const apiUrl = linkedinExtensionApiUrl({
		nodeEnvironment: process.env.NODE_ENV,
		publicApiUrl: process.env.PUBLIC_API_URL,
	});

	await packageLinkedinExtension({
		sourceDirectory,
		outputDirectory,
		apiUrl,
	});

	process.stdout.write(`Packaged ${basename(sourceDirectory)} for ${apiUrl}\n`);
}
