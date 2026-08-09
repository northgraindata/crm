import "@crm/env/load";

import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { type AgentDefinition, defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { openRouterModel, selectedModel } from "./lib/model";

if (process.env.CRM_BUILD !== "1") {
	void logCapabilities();
}

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

if (process.env.CRM_BUILD !== "1") {
	void syncVersion();
}

const agent: AgentDefinition = defineAgent({
	model: defineDynamic({
		fallback: openRouterModel(DEFAULT_AGENT_MODEL.id),
		events: {
			"step.started": (_event, ctx) => selectedModel(ctx.session.id),
		},
	}),
	modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});

export default agent;
