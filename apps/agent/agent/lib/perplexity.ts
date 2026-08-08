const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export function perplexityEnabled(): boolean {
	return Boolean(process.env.OPENROUTER_API_KEY);
}

export type AskOptions = {
	model?: "perplexity/sonar" | "perplexity/sonar-pro";
	domains?: string[];
	system?: string;
};

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) return { ok: false, reason: "No OPENROUTER_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: options.model ?? "perplexity/sonar",
				messages: [
					...(options.system
						? [{ role: "system", content: options.system }]
						: []),
					{ role: "user", content: question },
				],
				tools: [
					{
						type: "openrouter:web_search",
						parameters: {
							engine: "perplexity",
							max_results: 5,
							...(options.domains ? { allowed_domains: options.domains } : {}),
						},
					},
				],
			}),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as {
			choices?: {
				message?: {
					content?: string;
					annotations?: {
						type?: string;
						url_citation?: { url?: string };
					}[];
				};
			}[];
			citations?: string[];
			search_results?: { url?: string }[];
		};

		const text = body.choices?.[0]?.message?.content?.trim() ?? "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const annotations = body.choices?.[0]?.message?.annotations ?? [];
		const citations = [
			...(body.citations ?? []),
			...(body.search_results ?? []).flatMap((result) =>
				result.url ? [result.url] : [],
			),
			...annotations.flatMap((annotation) =>
				annotation.type === "url_citation" && annotation.url_citation?.url
					? [annotation.url_citation.url]
					: [],
			),
		];

		return { ok: true, data: { text, citations: [...new Set(citations)] } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	const slugs: string[] = [];

	for (const term of terms) {
		const answer = await ask(
			`Find the LinkedIn profile of the person called "${term}" who works at ${companyName}. Reply with their profile URL only.`,
			{ domains: ["linkedin.com"] },
		);

		if (!answer.ok) continue;

		const haystack = [answer.data.text, ...answer.data.citations].join(" ");
		for (const match of haystack.matchAll(
			/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
		)) {
			const slug = match[1];
			if (slug && !slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}
