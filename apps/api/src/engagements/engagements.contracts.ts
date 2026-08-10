import {
	BillingModel,
	CaseStudyStatus,
	EmploymentType,
	EngagementStatus,
	EngagementType,
	TeamMemberStatus,
	TestimonialStatus,
} from "@crm/db";
import { z } from "zod";
import { currencyCode } from "../currency/currency.contracts";
import { listInput } from "../trpc/list-input";

export const engagementType = z.enum(
	Object.values(EngagementType) as [EngagementType, ...EngagementType[]],
);
export const engagementStatus = z.enum(
	Object.values(EngagementStatus) as [EngagementStatus, ...EngagementStatus[]],
);
export const billingModel = z.enum(
	Object.values(BillingModel) as [BillingModel, ...BillingModel[]],
);
export const testimonialStatus = z.enum(
	Object.values(TestimonialStatus) as [
		TestimonialStatus,
		...TestimonialStatus[],
	],
);
export const caseStudyStatus = z.enum(
	Object.values(CaseStudyStatus) as [CaseStudyStatus, ...CaseStudyStatus[]],
);
export const teamMemberStatus = z.enum(
	Object.values(TeamMemberStatus) as [TeamMemberStatus, ...TeamMemberStatus[]],
);
export const employmentType = z.enum(
	Object.values(EmploymentType) as [EmploymentType, ...EmploymentType[]],
);

const decimal = z.number().finite().nonnegative().nullable().optional();

export const engagementListInput = z.object({
	status: engagementStatus.optional(),
	companyId: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const engagementIdInput = z.object({ id: z.string().min(1) });

export const engagementCreateInput = z.object({
	name: z.string().trim().min(1),
	companyId: z.string().min(1),
	sourceDealId: z.string().nullable().optional(),
	type: engagementType,
	status: engagementStatus.default(EngagementStatus.PLANNED),
	startDate: z.string().datetime().nullable().optional(),
	endDate: z.string().datetime().nullable().optional(),
	contractValue: decimal,
	currency: currencyCode.default("USD"),
	billingModel,
	deliveryLeadId: z.string().nullable().optional(),
	estimatedHours: decimal,
	actualHours: decimal,
	testimonialStatus: testimonialStatus.default(TestimonialStatus.NOT_REQUESTED),
	caseStudyStatus: caseStudyStatus.default(CaseStudyStatus.UNAVAILABLE),
	notes: z.string().trim().nullable().optional(),
	assignments: z
		.array(
			z.object({
				teamMemberId: z.string().min(1),
				role: z.string().trim().nullable().optional(),
				estimatedHours: decimal,
				actualHours: decimal,
				hourlyCostSnapshot: decimal,
			}),
		)
		.default([]),
});

export const engagementUpdateArgs = z.object({
	id: z.string().min(1),
	data: engagementCreateInput.partial(),
});

export const teamMemberListInput = listInput.extend({
	status: z.string().default("all"),
	employmentType: z.string().default("all"),
});

export const teamMemberIdInput = z.object({ id: z.string().min(1) });

export const teamMemberCreateInput = z.object({
	name: z.string().trim().min(1),
	email: z.string().trim().email().nullable().optional(),
	role: z.string().trim().nullable().optional(),
	status: teamMemberStatus.default(TeamMemberStatus.ACTIVE),
	employmentType: employmentType.default(EmploymentType.EMPLOYEE),
	hourlyCost: decimal,
	weeklyCapacity: decimal,
	startDate: z.string().datetime().nullable().optional(),
	endDate: z.string().datetime().nullable().optional(),
	userId: z.string().nullable().optional(),
});

export const teamMemberUpdateArgs = z.object({
	id: z.string().min(1),
	data: teamMemberCreateInput.partial(),
});
