import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import { SurveyAnalysisStatus, SurveyResponseStatus } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	SurveyResponseIngest,
	surveyListInput,
	surveyResponseListInput,
} from "./surveys.contracts";

@Injectable()
export class SurveysService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async ingest(input: SurveyResponseIngest) {
		const email = input.contact.email.trim().toLowerCase();
		const eventId = input.eventId ?? randomUUID();
		const now = new Date();
		const result = await this.db.$transaction(async (tx) => {
			const survey = await tx.survey.upsert({
				where: { slug: input.surveyId },
				create: {
					id: randomUUID(),
					slug: input.surveyId,
					name: input.surveyName ?? input.surveyId,
					version: input.surveyVersion,
					questionCount: input.questionCount,
				},
				update: {
					name: input.surveyName ?? undefined,
					version: input.surveyVersion,
					questionCount: input.questionCount,
				},
			});

			const contactName = splitName(input.contact.name);
			const contact = await tx.contact.upsert({
				where: { email },
				create: {
					id: randomUUID(),
					firstName: contactName.firstName,
					lastName: contactName.lastName,
					email,
					source: "IMPORT",
				},
				update: {
					firstName: contactName.firstName,
					lastName: contactName.lastName,
				},
			});

			let companyId: string | undefined;
			if (input.company?.name) {
				const domain = normalizeDomain(input.company.domain);
				const company = domain
					? await tx.company.upsert({
							where: { domain },
							create: {
								id: randomUUID(),
								name: input.company.name,
								domain,
								source: "IMPORT",
							},
							update: { name: input.company.name },
						})
					: await tx.company.create({
							data: {
								id: randomUUID(),
								name: input.company.name,
								source: "IMPORT",
							},
						});
				companyId = company.id;
				await tx.contact.update({
					where: { id: contact.id },
					data: { companyId },
				});
			}

			const response = await tx.surveyResponse.upsert({
				where: {
					surveyId_sessionId: {
						surveyId: survey.id,
						sessionId: input.sessionId,
					},
				},
				create: {
					id: randomUUID(),
					surveyId: survey.id,
					sessionId: input.sessionId,
					version: input.surveyVersion,
					status: input.status,
					analysisStatus: SurveyAnalysisStatus.PENDING,
					contactId: contact.id,
					companyId,
					respondentName: input.contact.name,
					respondentEmail: email,
					currentIndex: input.currentIndex,
					questionCount: input.questionCount,
					answers: input.answers,
					priority: input.priority,
					incentive: input.incentive,
					sourceUrl: input.sourceUrl,
					userAgent: input.userAgent,
					startedAt:
						input.status === SurveyResponseStatus.STARTED ? now : undefined,
					completedAt:
						input.status === SurveyResponseStatus.COMPLETED ? now : undefined,
				},
				update: {
					version: input.surveyVersion,
					status: input.status,
					contactId: contact.id,
					companyId,
					respondentName: input.contact.name,
					respondentEmail: email,
					currentIndex: input.currentIndex,
					questionCount: input.questionCount,
					answers: input.answers,
					priority: input.priority,
					incentive: input.incentive,
					sourceUrl: input.sourceUrl,
					userAgent: input.userAgent,
					completedAt:
						input.status === SurveyResponseStatus.COMPLETED ? now : undefined,
					abandonedAt:
						input.status === SurveyResponseStatus.ABANDONED ? now : undefined,
				},
			});

			await tx.surveyResponseEvent.upsert({
				where: { responseId_eventId: { responseId: response.id, eventId } },
				create: {
					id: randomUUID(),
					responseId: response.id,
					eventId,
					status: input.status,
					currentIndex: input.currentIndex,
					answers: input.answers,
					priority: input.priority,
				},
				update: {},
			});

			return { survey, response, contact, companyId };
		});

		if (input.status === SurveyResponseStatus.COMPLETED) {
			await this.queueAnalysis(
				result.response.id,
				result.contact.id,
				result.companyId,
			);
		}

		return {
			...this.serializeResponse(result.response),
			surveyId: result.survey.id,
			contactId: result.contact.id,
			companyId: result.companyId ?? null,
		};
	}

	async listSurveys(input: Pick<z.infer<typeof surveyListInput>, "status">) {
		return this.db.survey.findMany({
			where: { status: input.status },
			orderBy: { updatedAt: "desc" },
			include: { _count: { select: { responses: true } } },
		});
	}

	async listResponses(input: z.infer<typeof surveyResponseListInput>) {
		const rows = await this.db.surveyResponse.findMany({
			where: {
				status: input.status,
				analysisStatus: input.analysisStatus,
				surveyId: input.surveyId,
			},
			orderBy: { lastSavedAt: "desc" },
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			include: { survey: true, contact: true, company: true },
		});
		const next = rows.length > input.limit ? (rows.pop()?.id ?? null) : null;
		return {
			rows: rows.map((row) => this.serializeResponse(row)),
			nextCursor: next,
		};
	}

	async byId(id: string) {
		const row = await this.db.surveyResponse.findUnique({
			where: { id },
			include: {
				survey: true,
				contact: true,
				company: true,
				events: { orderBy: { receivedAt: "asc" } },
			},
		});
		if (!row) throw new NotFoundException("Survey response not found.");
		return this.serializeResponse(row);
	}

	private async queueAnalysis(
		responseId: string,
		contactId: string,
		companyId?: string,
	) {
		const existing = await this.db.agentTask.findFirst({
			where: {
				kind: "survey-analysis",
				surveyResponseId: responseId,
				finishedAt: null,
			},
			select: { id: true },
		});
		if (existing) return;
		await this.db.agentTask.create({
			data: {
				id: randomUUID(),
				kind: "survey-analysis",
				surveyResponseId: responseId,
				contactId,
				companyId,
				reason: "Completed survey response needs analysis.",
				priority: 140,
				budget: 8,
				dueAt: new Date(),
			},
		});
	}

	private serializeResponse<T extends SurveyResponseDates>(row: T) {
		return {
			...row,
			startedAt: row.startedAt?.toISOString?.() ?? row.startedAt,
			lastSavedAt: row.lastSavedAt?.toISOString?.() ?? row.lastSavedAt,
			completedAt: row.completedAt?.toISOString?.() ?? null,
			abandonedAt: row.abandonedAt?.toISOString?.() ?? null,
		};
	}
}

type SurveyResponseDates = {
	startedAt: Date;
	lastSavedAt: Date;
	completedAt: Date | null;
	abandonedAt: Date | null;
};

function splitName(value: string) {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	return {
		firstName: parts[0] ?? "Unknown",
		lastName: parts.slice(1).join(" ") || null,
	};
}

function normalizeDomain(value?: string) {
	const domain = value
		?.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.split("/")[0];
	return domain || undefined;
}
