import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const extensionRoot = join(import.meta.dir, "..");
const sharedSource = await readFile(join(extensionRoot, "shared.js"), "utf8");
const backgroundSource = await readFile(
	join(extensionRoot, "background.js"),
	"utf8",
);

type QueueItem = {
	id: string;
	status: string;
	extractionStage?: "profile" | "companySearch" | "company";
	details: {
		firstName: string;
		profileUrl: string;
		companyLinkedInUrl?: string;
		companyWebsite?: string;
		companyDomain?: string;
		reason?: string;
	};
	extractionTabId?: number;
};

function harness(initialQueue?: { items: QueueItem[]; paused: boolean }) {
	let stored: Record<string, unknown> = {
		apiUrl: "https://crm.example.com",
		token: "token",
		...(initialQueue ? { northgrainQueueV1: initialQueue } : {}),
	};
	let listener:
		| ((
				message: unknown,
				sender: unknown,
				sendResponse: (response: unknown) => void,
		  ) => boolean)
		| undefined;
	const createdTabs: Array<{ id: number; url: string }> = [];
	const removedTabs: number[] = [];
	const captureRequests: unknown[] = [];
	const chrome = {
		runtime: {
			lastError: undefined,
			getManifest: () => ({ version: "1.4.0" }),
			onMessage: {
				addListener: (value: typeof listener) => {
					listener = value;
				},
			},
		},
		storage: {
			local: {
				get: (keys: string | string[], callback: (value: unknown) => void) => {
					const selected = (Array.isArray(keys) ? keys : [keys]).reduce<
						Record<string, unknown>
					>((result, key) => {
						if (key in stored) result[key] = stored[key];
						return result;
					}, {});
					callback(selected);
				},
				set: (value: Record<string, unknown>, callback: () => void) => {
					stored = { ...stored, ...structuredClone(value) };
					callback();
				},
			},
		},
		tabs: {
			query: (_query: unknown, callback: (value: unknown[]) => void) =>
				callback([]),
			create: (
				options: { url: string },
				callback: (value: { id: number; url: string }) => void,
			) => {
				const tab = { id: createdTabs.length + 1, url: options.url };
				createdTabs.push(tab);
				callback(tab);
			},
			remove: (id: number, callback: () => void) => {
				removedTabs.push(id);
				callback();
			},
			onRemoved: { addListener: () => undefined },
		},
		alarms: {
			create: () => undefined,
			onAlarm: { addListener: () => undefined },
		},
	};
	const context = vm.createContext({
		chrome,
		crypto,
		Date,
		AbortSignal,
		URL,
		setTimeout: () => 1,
		clearTimeout: () => undefined,
		importScripts: () => undefined,
		fetch: async (input: string, options?: { body?: string }) => {
			if (input.endsWith("/api/v1/linkedin/captures")) {
				captureRequests.push(JSON.parse(options?.body ?? "{}"));
				return new Response(JSON.stringify({ contactId: "contact-1" }), {
					status: 200,
				});
			}
			return new Response(null, { status: 404 });
		},
		Response,
	});
	vm.runInContext(sharedSource, context);
	vm.runInContext(backgroundSource, context);

	async function message(value: unknown, sender: unknown = {}) {
		if (!listener)
			throw new Error("Background message listener was not installed.");
		return new Promise<unknown>((resolve) => {
			listener?.(value, sender, resolve);
		});
	}

	async function waitFor(check: () => boolean) {
		for (let attempt = 0; attempt < 100; attempt += 1) {
			if (check()) return;
			await new Promise((resolve) => globalThis.setTimeout(resolve, 1));
		}
		throw new Error("Background operation did not settle.");
	}

	function queue() {
		return (
			(stored.northgrainQueueV1 as {
				items: QueueItem[];
				paused: boolean;
			}) ?? { items: [], paused: false }
		);
	}

	return { message, waitFor, queue, createdTabs, removedTabs, captureRequests };
}

const person = (slug: string) => ({
	profileUrl: `https://www.linkedin.com/in/${slug}`,
	firstName: slug,
	reason: "Relationship",
	inbound: true,
	connectionStatus: "connected",
	createFollowUp: true,
});

describe("LinkedIn extension background queue", () => {
	it("serializes inactive-tab extraction and deduplicates captures", async () => {
		const context = harness();
		const responses = await Promise.all([
			context.message({
				type: "northgrain:queue-add",
				details: person("first-person"),
				enrich: true,
			}),
			context.message({
				type: "northgrain:queue-add",
				details: person("second-person"),
				enrich: true,
			}),
			context.message({
				type: "northgrain:queue-add",
				details: person("first-person"),
				enrich: true,
			}),
		]);
		for (const response of responses) {
			if (!(response as { ok?: boolean }).ok) {
				throw new Error(JSON.stringify(response));
			}
		}
		await context.waitFor(
			() =>
				context.createdTabs.length === 1 &&
				context.queue().items[0]?.status === "extracting",
		);

		expect(context.queue().items).toHaveLength(2);
		expect(context.createdTabs.map((tab) => tab.url)).toEqual([
			"https://www.linkedin.com/in/first-person/details/experience/",
		]);

		await context.message(
			{
				type: "northgrain:profile-loaded",
				details: {
					...person("first-person"),
					firstName: "Wrong",
					lastName: "Identity",
					reason: "Potential client",
					title: "Data leader",
					companyName: "First Company",
					companyLinkedInUrl: "https://www.linkedin.com/company/first-company/",
				},
			},
			{ tab: { id: 1 } },
		);
		await context.waitFor(() => context.createdTabs.length === 2);

		expect(context.removedTabs).toEqual([1]);
		expect(context.createdTabs[1]?.url).toBe(
			"https://www.linkedin.com/company/first-company/about/",
		);
		expect(
			await context.message(
				{ type: "northgrain:extraction-context" },
				{ tab: { id: 2 } },
			),
		).toMatchObject({ extraction: true, stage: "company" });

		await context.message(
			{
				type: "northgrain:company-loaded",
				details: {
					companyName: "First Company Correct",
					companyWebsite: "https://first.example.com/",
					companyDomain: "first.example.com",
				},
			},
			{ tab: { id: 2 } },
		);
		await context.waitFor(() => context.createdTabs.length === 3);

		expect(context.removedTabs).toEqual([1, 2]);
		expect(context.createdTabs[2]?.url).toBe(
			"https://www.linkedin.com/in/second-person/details/experience/",
		);
		expect(context.queue().items[0]?.details).toMatchObject({
			firstName: "first-person",
			reason: "Relationship",
			title: "Data leader",
			companyName: "First Company Correct",
			companyDomain: "first.example.com",
			inbound: true,
			createFollowUp: true,
		});
	});

	it("keeps a reviewed capture until the CRM confirms it", async () => {
		const context = harness();
		const added = (await context.message({
			type: "northgrain:queue-add",
			details: person("saved-person"),
			enrich: false,
		})) as { item: QueueItem };
		if (!added.item) throw new Error(JSON.stringify(added));

		await context.message({
			type: "northgrain:queue-save",
			id: added.item.id,
			details: person("saved-person"),
		});
		await context.waitFor(() => context.captureRequests.length === 1);
		await context.waitFor(() => context.queue().items.length === 0);

		expect(context.captureRequests[0]).toMatchObject({
			profileUrl: "https://www.linkedin.com/in/saved-person",
		});
	});

	it("retries enrichment when an existing draft has no company website", async () => {
		const context = harness();
		await context.message({
			type: "northgrain:queue-add",
			details: person("retry-person"),
			enrich: false,
		});
		expect(context.queue().items[0]?.status).toBe("ready");

		await context.message({
			type: "northgrain:queue-add",
			details: person("retry-person"),
			enrich: true,
		});
		await context.waitFor(
			() =>
				context.createdTabs.length === 1 &&
				context.queue().items[0]?.status === "extracting",
		);

		expect(context.queue().items).toHaveLength(1);
		expect(context.queue().items[0]).toMatchObject({
			status: "extracting",
			extractionStage: "profile",
		});
		expect(context.createdTabs[0]?.url).toBe(
			"https://www.linkedin.com/in/retry-person/details/experience/",
		);
	});

	it("replaces stale enrichment when a profile is reviewed again", async () => {
		const context = harness();
		await context.message({
			type: "northgrain:queue-add",
			details: {
				...person("stale-person"),
				companyName: "Old School",
				companyWebsite: "https://old-school.example/",
				companyDomain: "old-school.example",
			},
			enrich: false,
		});

		await context.message({
			type: "northgrain:queue-add",
			details: person("stale-person"),
			enrich: true,
		});
		await context.waitFor(
			() => context.queue().items[0]?.status === "extracting",
		);

		expect(context.queue().items[0]?.details).not.toHaveProperty(
			"companyWebsite",
		);
		expect(context.createdTabs[0]?.url).toBe(
			"https://www.linkedin.com/in/stale-person/details/experience/",
		);
	});

	it("upgrades an old ready draft into the enrichment queue", async () => {
		const context = harness({
			paused: false,
			items: [
				{
					id: "old-draft",
					status: "ready",
					details: person("old-person"),
				},
			],
		});
		await context.waitFor(
			() =>
				context.createdTabs.length === 1 &&
				context.queue().items[0]?.status === "extracting",
		);

		expect(context.queue().items[0]).toMatchObject({
			id: "old-draft",
			status: "extracting",
			extractionStage: "profile",
		});
		expect(context.createdTabs[0]?.url).toBe(
			"https://www.linkedin.com/in/old-person/details/experience/",
		);
	});

	it("resolves a company button through LinkedIn company search", async () => {
		const context = harness();
		await context.message({
			type: "northgrain:queue-add",
			details: person("button-person"),
			enrich: true,
		});
		await context.waitFor(
			() => context.queue().items[0]?.status === "extracting",
		);

		expect(
			await context.message(
				{
					type: "northgrain:profile-company-search",
					details: {
						...person("button-person"),
						companyName: "Button Company",
					},
				},
				{ tab: { id: 1 } },
			),
		).toMatchObject({
			extraction: true,
			searchUrl:
				"https://www.linkedin.com/search/results/companies/?keywords=Button%20Company",
		});
		expect(context.queue().items[0]).toMatchObject({
			status: "extracting",
			extractionStage: "companySearch",
		});
		expect(context.removedTabs).toEqual([]);

		expect(
			await context.message(
				{
					type: "northgrain:company-search-resolved",
					companyLinkedInUrl:
						"https://www.linkedin.com/company/button-company/",
				},
				{ tab: { id: 1 } },
			),
		).toMatchObject({
			extraction: true,
			companyUrl: "https://www.linkedin.com/company/button-company/about/",
		});
		expect(context.queue().items[0]?.extractionStage).toBe("company");

		await context.message(
			{
				type: "northgrain:company-loaded",
				details: {
					companyWebsite: "https://button.example.com/",
					companyDomain: "button.example.com",
				},
			},
			{ tab: { id: 1 } },
		);
		await context.waitFor(() => context.removedTabs.length === 1);
		expect(context.queue().items[0]?.details.companyWebsite).toBe(
			"https://button.example.com/",
		);
	});

	it("finishes safely when LinkedIn company search is ambiguous", async () => {
		const context = harness();
		await context.message({
			type: "northgrain:queue-add",
			details: person("ambiguous-person"),
			enrich: true,
		});
		await context.waitFor(
			() => context.queue().items[0]?.status === "extracting",
		);
		await context.message(
			{
				type: "northgrain:profile-company-search",
				details: {
					...person("ambiguous-person"),
					companyName: "Graphene",
				},
			},
			{ tab: { id: 1 } },
		);

		expect(
			await context.message(
				{
					type: "northgrain:company-search-resolved",
					companyLinkedInUrl: undefined,
				},
				{ tab: { id: 1 } },
			),
		).toMatchObject({ extraction: true });
		await context.waitFor(() => context.queue().items[0]?.status === "ready");

		expect(context.removedTabs).toEqual([1]);
		expect(context.queue().items[0]).toMatchObject({
			status: "ready",
			warning:
				"LinkedIn did not expose one unambiguous exact company page, so the company website was left empty.",
		});
	});
});
