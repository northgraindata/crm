import type { Db } from "@crm/db";
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Req,
	UseGuards,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import type { ZodType } from "zod";
import {
	activityCreateInput,
	completeInput,
	timelineInput,
} from "../activities/activities.contracts";
import { ActivitiesService } from "../activities/activities.service";
import {
	companyCreateInput,
	companyListInput,
	companyUpdateArgs,
} from "../companies/companies.contracts";
import { CompaniesService } from "../companies/companies.service";
import {
	contactCreateInput,
	contactListInput,
	contactUpdateArgs,
} from "../contacts/contacts.contracts";
import { ContactsService } from "../contacts/contacts.service";
import { InjectDatabase } from "../database/database.constants";
import {
	dealCreateInput,
	dealListInput,
	dealUpdateArgs,
} from "../deals/deals.contracts";
import { DealsService } from "../deals/deals.service";
import {
	surveyResponseIngestInput,
	surveyResponseListInput,
} from "../surveys/surveys.contracts";
import { SurveysService } from "../surveys/surveys.service";
import { ApiAccessGuard, type ApiRequest } from "./api-access.guard";
import { linkedinCaptureInput } from "./linkedin-capture.contracts";
import { LinkedInCaptureService } from "./linkedin-capture.service";

@Controller("api/v1")
@AllowAnonymous()
@UseGuards(ApiAccessGuard)
export class ApiAccessController {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly contacts: ContactsService,
		private readonly deals: DealsService,
		private readonly linkedin: LinkedInCaptureService,
		private readonly activities: ActivitiesService,
		private readonly surveys: SurveysService,
	) {}

	@Get("me")
	async me(@Req() request: ApiRequest) {
		const principal = request.apiToken;
		if (!principal) throw new ForbiddenException();
		const user = await this.db.user.findUnique({
			where: { id: principal.userId },
			select: { id: true, name: true, email: true },
		});
		return {
			user,
			token: {
				id: principal.tokenId,
				scopes: principal.scopes,
				expiresAt: principal.expiresAt,
			},
		};
	}

	@Post("linkedin/captures")
	async linkedinCapture(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		if (!request.apiToken) throw new ForbiddenException();
		return this.linkedin.capture(
			parseInput(linkedinCaptureInput, body),
			request.apiToken.userId,
		);
	}

	@Post("surveys/responses")
	async surveyResponse(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		return this.surveys.ingest(parseInput(surveyResponseIngestInput, body));
	}

	@Get("surveys")
	async surveysList(@Req() request: ApiRequest) {
		requireRead(request);
		return this.surveys.listSurveys({});
	}

	@Get("surveys/responses")
	async surveyResponsesList(
		@Req() request: ApiRequest,
		@Query() query: Record<string, string>,
	) {
		requireRead(request);
		return this.surveys.listResponses(
			parseInput(surveyResponseListInput, {
				...query,
				limit: number(query.limit, 50),
			}),
		);
	}

	@Get("surveys/responses/:id")
	async surveyResponseById(
		@Req() request: ApiRequest,
		@Param("id") id: string,
	) {
		requireRead(request);
		return this.surveys.byId(id);
	}

	@Get("activities")
	async activitiesList(
		@Req() request: ApiRequest,
		@Query() query: Record<string, string>,
	) {
		requireRead(request);
		return this.activities.timeline(
			parseInput(timelineInput, {
				...query,
				limit: number(query.limit, 50),
			}),
		);
	}

	@Post("activities")
	async createActivity(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		if (!request.apiToken) throw new ForbiddenException();
		return this.activities.create(
			parseInput(activityCreateInput, body),
			request.apiToken.userId,
		);
	}

	@Patch("activities/:id")
	async completeActivity(
		@Req() request: ApiRequest,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		requireWrite(request);
		const input = parseInput(completeInput, {
			...(body as Record<string, unknown>),
			id,
		});
		return this.activities.complete(input.id, input.completed);
	}

	@Get("companies")
	async companiesList(
		@Req() request: ApiRequest,
		@Query() query: Record<string, string>,
	) {
		requireRead(request);
		return this.companies.list(
			parseInput(companyListInput, {
				...query,
				page: number(query.page, 1),
				pageSize: number(query.pageSize, 25),
			}),
		);
	}

	@Get("companies/:id")
	async company(@Req() request: ApiRequest, @Param("id") id: string) {
		requireRead(request);
		return this.companies.byId(id);
	}

	@Post("companies")
	async createCompany(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		return this.companies.create(parseInput(companyCreateInput, body));
	}

	@Patch("companies/:id")
	async updateCompany(
		@Req() request: ApiRequest,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		requireWrite(request);
		return this.companies.update(
			id,
			parseInput(companyUpdateArgs.shape.data, body),
		);
	}

	@Delete("companies/:id")
	async deleteCompany(@Req() request: ApiRequest, @Param("id") id: string) {
		requireWrite(request);
		return this.companies.delete(id);
	}

	@Get("contacts")
	async contactsList(
		@Req() request: ApiRequest,
		@Query() query: Record<string, string>,
	) {
		requireRead(request);
		return this.contacts.list(
			parseInput(contactListInput, {
				...query,
				page: number(query.page, 1),
				pageSize: number(query.pageSize, 25),
			}),
		);
	}

	@Get("contacts/:id")
	async contact(@Req() request: ApiRequest, @Param("id") id: string) {
		requireRead(request);
		return this.contacts.byId(id);
	}

	@Post("contacts")
	async createContact(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		return this.contacts.create(parseInput(contactCreateInput, body));
	}

	@Patch("contacts/:id")
	async updateContact(
		@Req() request: ApiRequest,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		requireWrite(request);
		return this.contacts.update(
			id,
			parseInput(contactUpdateArgs.shape.data, body),
		);
	}

	@Delete("contacts/:id")
	async deleteContact(@Req() request: ApiRequest, @Param("id") id: string) {
		requireWrite(request);
		return this.contacts.delete(id);
	}

	@Get("deals")
	async dealsList(
		@Req() request: ApiRequest,
		@Query() query: Record<string, string>,
	) {
		requireRead(request);
		return this.deals.list(
			parseInput(dealListInput, {
				...query,
				page: number(query.page, 1),
				pageSize: number(query.pageSize, 25),
			}),
		);
	}

	@Get("deals/:id")
	async deal(@Req() request: ApiRequest, @Param("id") id: string) {
		requireRead(request);
		return this.deals.byId(id);
	}

	@Post("deals")
	async createDeal(@Req() request: ApiRequest, @Body() body: unknown) {
		requireWrite(request);
		return this.deals.create(parseInput(dealCreateInput, body));
	}

	@Patch("deals/:id")
	async updateDeal(
		@Req() request: ApiRequest,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		requireWrite(request);
		return this.deals.update(id, parseInput(dealUpdateArgs.shape.data, body));
	}

	@Delete("deals/:id")
	async deleteDeal(@Req() request: ApiRequest, @Param("id") id: string) {
		requireWrite(request);
		return this.deals.delete(id);
	}
}

function number(value: string | undefined, fallback: number): number {
	return value === undefined ? fallback : Number(value);
}

function parseInput<T>(schema: ZodType<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (!result.success) throw new BadRequestException(result.error.flatten());
	return result.data;
}

function requireRead(
	request: Request & { apiToken?: { scopes: readonly string[] } },
): void {
	if (
		!request.apiToken?.scopes.includes("crm:read") &&
		!request.apiToken?.scopes.includes("crm:write")
	) {
		throw new ForbiddenException("This token does not have crm:read scope.");
	}
}

function requireWrite(
	request: Request & { apiToken?: { scopes: readonly string[] } },
): void {
	if (!request.apiToken?.scopes.includes("crm:write")) {
		throw new ForbiddenException("This token does not have crm:write scope.");
	}
}
