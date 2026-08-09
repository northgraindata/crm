import {
	SurveyAnalysisStatus,
	SurveyResponseStatus,
	SurveyStatus,
} from "@crm/db";
import { z } from "zod";

const surveyStatus = z.enum(
	Object.values(SurveyStatus) as [SurveyStatus, ...SurveyStatus[]],
);
const responseStatus = z.enum(
	Object.values(SurveyResponseStatus) as [
		SurveyResponseStatus,
		...SurveyResponseStatus[],
	],
);
const analysisStatus = z.enum(
	Object.values(SurveyAnalysisStatus) as [
		SurveyAnalysisStatus,
		...SurveyAnalysisStatus[],
	],
);

const answers = z
	.record(
		z.string().min(1).max(120),
		z.object({
			answer: z.union([
				z.string().max(5000),
				z.array(z.string().max(5000)).max(100),
			]),
			other: z.string().max(5000).optional(),
		}),
	)
	.refine((value) => Object.keys(value).length <= 500, "Too many answers.");

export const surveyResponseIngestInput = z.object({
	surveyId: z.string().trim().min(1).max(160),
	surveyName: z.string().trim().min(1).max(240).optional(),
	surveyVersion: z.number().int().min(1).default(1),
	eventId: z.string().trim().min(1).max(160).optional(),
	sessionId: z.string().trim().min(1).max(120),
	status: responseStatus,
	currentIndex: z.number().int().min(0).max(500),
	questionCount: z.number().int().min(1).max(500),
	contact: z.object({
		name: z.string().trim().min(2).max(200),
		email: z.string().trim().email().max(320),
	}),
	company: z
		.object({
			name: z.string().trim().min(1).max(240),
			domain: z.string().trim().max(255).optional(),
		})
		.optional(),
	answers,
	priority: z.record(z.string().max(120), z.boolean()).optional(),
	incentive: z.record(z.string().max(120), z.string().max(500)).optional(),
	sourceUrl: z.string().url().max(2000).optional(),
	userAgent: z.string().max(1000).optional(),
});

export const surveyListInput = z.object({
	status: surveyStatus.optional(),
});

export const surveyResponseListInput = z.object({
	surveyId: z.string().min(1).optional(),
	status: responseStatus.optional(),
	analysisStatus: analysisStatus.optional(),
	limit: z.number().int().min(1).max(100).default(50),
	cursor: z.string().optional(),
});

export const surveyResponseIdInput = z.object({ id: z.string().min(1) });

export type SurveyResponseIngest = z.infer<typeof surveyResponseIngestInput>;
