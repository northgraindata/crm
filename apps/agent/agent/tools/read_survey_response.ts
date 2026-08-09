import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Read one stored survey response, including its current answers, respondent, survey name and progress. Use this before analyzing a survey response.",
	inputSchema: z.object({ responseId: z.string().min(1) }),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		const response = await db.surveyResponse.findUnique({
			where: { id: input.responseId },
			include: { survey: true, contact: true, company: true },
		});
		if (!response)
			return { found: false as const, reason: "Survey response not found." };

		return {
			found: true as const,
			id: response.id,
			survey: {
				id: response.survey.id,
				slug: response.survey.slug,
				name: response.survey.name,
				version: response.survey.version,
			},
			status: response.status,
			progress: {
				currentIndex: response.currentIndex,
				questionCount: response.questionCount,
			},
			respondent: {
				name: response.respondentName,
				email: response.respondentEmail,
			},
			contactId: response.contactId,
			companyId: response.companyId,
			answers: response.answers,
			priority: response.priority,
			incentive: response.incentive,
		};
	},
});
