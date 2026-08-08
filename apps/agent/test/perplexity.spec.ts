import { afterEach, describe, expect, it } from "bun:test";
import { ask } from "../agent/lib/perplexity";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = originalKey;
});

describe("OpenRouter web research", () => {
	it("uses Perplexity Sonar and returns standardized citations", async () => {
		process.env.OPENROUTER_API_KEY = "test-key";
		let request: { input: string; init?: RequestInit } | undefined;

		globalThis.fetch = (async (input, init) => {
			request = { input: String(input), init };
			return Response.json({
				choices: [
					{
						message: {
							content: "A cited answer.",
							annotations: [
								{
									type: "url_citation",
									url_citation: { url: "https://example.com/source" },
								},
							],
						},
					},
				],
			});
		}) as typeof fetch;

		const result = await ask("Who works there?", {
			domains: ["linkedin.com"],
			model: "perplexity/sonar-pro",
		});

		expect(result).toEqual({
			ok: true,
			data: {
				text: "A cited answer.",
				citations: ["https://example.com/source"],
			},
		});
		expect(request?.input).toBe(
			"https://openrouter.ai/api/v1/chat/completions",
		);

		const body = JSON.parse(String(request?.init?.body));
		expect(body.model).toBe("perplexity/sonar-pro");
		expect(body.tools).toEqual([
			{
				type: "openrouter:web_search",
				parameters: {
					engine: "perplexity",
					max_results: 5,
					allowed_domains: ["linkedin.com"],
				},
			},
		]);
	});

	it("stays unavailable without an OpenRouter key", async () => {
		delete process.env.OPENROUTER_API_KEY;

		expect(await ask("Anything new?")).toEqual({
			ok: false,
			reason: "No OPENROUTER_API_KEY.",
		});
	});
});
