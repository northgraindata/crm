import { Inject } from "@nestjs/common";
import { Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	surveyListInput,
	surveyResponseIdInput,
	surveyResponseListInput,
} from "./surveys.contracts";
import { SurveysService } from "./surveys.service";

@Router({ alias: "surveys" })
@UseMiddlewares(AuthMiddleware)
export class SurveysRouter {
	constructor(
		@Inject(SurveysService) private readonly surveys: SurveysService,
	) {}

	@Query({ input: surveyListInput })
	async list(@Input() input: z.infer<typeof surveyListInput>) {
		return this.surveys.listSurveys(input);
	}

	@Query({ input: surveyResponseListInput })
	async responses(@Input() input: z.infer<typeof surveyResponseListInput>) {
		return this.surveys.listResponses(input);
	}

	@Query({ input: surveyResponseIdInput })
	async response(@Input("id") id: string) {
		return this.surveys.byId(id);
	}
}
