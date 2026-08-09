import { db, SurveyAnalysisStatus } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Store a concise analysis of one completed survey response in the CRM. Use only the answers present in the response.",
	inputSchema: z.object({
		responseId: z.string().min(1),
		summary: z.string().trim().min(1).max(5000),
		themes: z.array(z.string().trim().min(1).max(500)).max(20),
		signals: z.array(z.string().trim().min(1).max(500)).max(20),
		icpFit: z.enum(["unknown", "low", "medium", "high"]),
		recommendedNextAction: z.string().trim().min(1).max(1000),
		confidence: z.number().min(0).max(1),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		const response = await db.surveyResponse.findUnique({
			where: { id: input.responseId },
			select: { id: true },
		});
		if (!response)
			return { updated: false as const, reason: "Survey response not found." };

		await db.surveyResponse.update({
			where: { id: response.id },
			data: {
				analysisStatus: SurveyAnalysisStatus.COMPLETE,
				analysis: {
					summary: input.summary,
					themes: input.themes,
					signals: input.signals,
					icpFit: input.icpFit,
					recommendedNextAction: input.recommendedNextAction,
					confidence: input.confidence,
				},
				analysisError: null,
			},
		});

		return { updated: true as const, responseId: response.id };
	},
});
