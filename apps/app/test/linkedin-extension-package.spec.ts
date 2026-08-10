import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import {
	linkedinExtensionApiUrl,
	packageLinkedinExtension,
} from "../scripts/package-linkedin-extension";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) =>
			rm(directory, {
				recursive: true,
				force: true,
			}),
		),
	);
});

describe("packageLinkedinExtension", () => {
	it("uses localhost locally and the public API in production", () => {
		expect(
			linkedinExtensionApiUrl({
				nodeEnvironment: "development",
				publicApiUrl: "https://api.example.com",
			}),
		).toBe("http://localhost:3001");
		expect(
			linkedinExtensionApiUrl({
				nodeEnvironment: "production",
				publicApiUrl: "https://api.example.com",
			}),
		).toBe("https://api.example.com");
	});

	it("creates every public download with the configured API URL", async () => {
		const root = await mkdtemp(join(tmpdir(), "crm-linkedin-extension-"));
		temporaryDirectories.push(root);

		const sourceDirectory = join(root, "source");
		const outputDirectory = join(root, "downloads");
		await mkdir(sourceDirectory);
		await writeFile(join(sourceDirectory, "manifest.json"), '{"version":"1"}');
		await writeFile(join(sourceDirectory, "config.js"), "local config");

		await packageLinkedinExtension({
			sourceDirectory,
			outputDirectory,
			apiUrl: "https://crm.example.com",
		});

		for (const name of [
			"northgrain-linkedin-chrome.zip",
			"northgrain-linkedin-safari.zip",
			"northgrain-linkedin-extension.zip",
		]) {
			const archive = unzipSync(
				new Uint8Array(await readFile(join(outputDirectory, name))),
			);
			const manifest = archive["manifest.json"];
			const config = archive["config.js"];

			if (!manifest || !config) throw new Error(`Incomplete archive: ${name}`);

			expect(strFromU8(manifest)).toBe('{"version":"1"}');
			expect(strFromU8(config)).toBe(
				'globalThis.NORTHGRAIN_EXTENSION_CONFIG = { apiUrl: "https://crm.example.com" };\n',
			);
		}
	});
});
