import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import { openrouter } from "@openrouter/ai-sdk-provider";

export interface ModelSelection {
	model: ReturnType<typeof openrouter.chat>;
	modelContextWindowTokens: number;
}

const selections = new Map<string, Promise<ModelSelection | null>>();
const MAX_CACHED_SESSIONS = 1_000;

export function openRouterModel(
	id: string,
): ReturnType<typeof openrouter.chat> {
	return openrouter.chat(id);
}

async function readSelectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: openRouterModel(setting.id),
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export function selectedModel(
	sessionId: string,
): Promise<ModelSelection | null> {
	const cached = selections.get(sessionId);
	if (cached) return cached;

	if (selections.size >= MAX_CACHED_SESSIONS) {
		const oldest = selections.keys().next().value;
		if (oldest) selections.delete(oldest);
	}

	const selection = readSelectedModel();
	selections.set(sessionId, selection);
	return selection;
}
