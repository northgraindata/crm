import type { Db, Prisma } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	engagementCreateInput,
	engagementListInput,
	engagementUpdateArgs,
	teamMemberCreateInput,
	teamMemberListInput,
	teamMemberUpdateArgs,
} from "./engagements.contracts";

const include = {
	company: { select: { id: true, name: true } },
	sourceDeal: { select: { id: true, name: true, stage: true } },
	deliveryLead: { select: { id: true, name: true, role: true } },
	assignments: {
		include: { teamMember: true },
		orderBy: { createdAt: "asc" },
	},
} as const satisfies Prisma.EngagementInclude;

type EngagementRow = Prisma.EngagementGetPayload<{ include: typeof include }>;
type EngagementAssignmentRow = EngagementRow["assignments"][number];

type TeamMemberRow = ReturnType<typeof serializeTeamMember>;

const TEAM_MEMBER_SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.TeamMemberOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	email: (dir) => [{ email: { sort: dir, nulls: "last" } }],
	role: (dir) => [{ role: { sort: dir, nulls: "last" } }, { name: "asc" }],
	status: (dir) => [{ status: dir }, { name: "asc" }],
	employmentType: (dir) => [{ employmentType: dir }, { name: "asc" }],
	weeklyCapacity: (dir) => [
		{ weeklyCapacity: { sort: dir, nulls: "last" } },
		{ name: "asc" },
	],
	startDate: (dir) => [
		{ startDate: { sort: dir, nulls: "last" } },
		{ name: "asc" },
	],
};

@Injectable()
export class EngagementsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: z.infer<typeof engagementListInput>) {
		const rows = await this.db.engagement.findMany({
			where: {
				...(input.status ? { status: input.status } : {}),
				...(input.companyId ? { companyId: input.companyId } : {}),
			},
			include,
			orderBy: [{ status: "asc" }, { endDate: "asc" }, { createdAt: "desc" }],
			take: input.limit,
		});
		return rows.map(serializeEngagement);
	}

	async byId(id: string) {
		const row = await this.db.engagement.findUnique({ where: { id }, include });
		if (!row) throw new NotFoundException(`No engagement with id ${id}.`);
		return serializeEngagement(row);
	}

	async create(input: z.infer<typeof engagementCreateInput>) {
		await this.assertReferences(
			input.companyId,
			input.sourceDealId,
			input.deliveryLeadId,
		);
		const financials = calculateFinancials(
			input.contractValue,
			input.actualHours,
			input.assignments,
		);
		const row = await this.db.engagement.create({
			data: {
				...scalarData(input),
				...financials,
				assignments: {
					create: input.assignments.map((assignment) => ({
						teamMemberId: assignment.teamMemberId,
						role: assignment.role ?? null,
						estimatedHours: assignment.estimatedHours ?? null,
						actualHours: assignment.actualHours ?? null,
						hourlyCostSnapshot: assignment.hourlyCostSnapshot ?? null,
					})),
				},
			},
			include,
		});
		return serializeEngagement(row);
	}

	async update(
		id: string,
		input: z.infer<typeof engagementUpdateArgs>["data"],
	) {
		const existing = await this.db.engagement.findUnique({ where: { id } });
		if (!existing) throw new NotFoundException(`No engagement with id ${id}.`);
		if (input.companyId || input.sourceDealId || input.deliveryLeadId) {
			await this.assertReferences(
				input.companyId ?? existing.companyId,
				input.sourceDealId === undefined
					? existing.sourceDealId
					: input.sourceDealId,
				input.deliveryLeadId === undefined
					? existing.deliveryLeadId
					: input.deliveryLeadId,
			);
		}
		const { assignments, ...rest } = input;
		const row = await this.db.$transaction(async (tx) => {
			if (assignments) {
				await tx.engagementAssignment.deleteMany({
					where: { engagementId: id },
				});
				await tx.engagementAssignment.createMany({
					data: assignments.map((assignment) => ({
						engagementId: id,
						teamMemberId: assignment.teamMemberId,
						role: assignment.role ?? null,
						estimatedHours: assignment.estimatedHours ?? null,
						actualHours: assignment.actualHours ?? null,
						hourlyCostSnapshot: assignment.hourlyCostSnapshot ?? null,
					})),
				});
			}
			const assignmentRows = await tx.engagementAssignment.findMany({
				where: { engagementId: id },
			});
			const financials = calculateFinancials(
				input.contractValue === undefined
					? existing.contractValue
					: input.contractValue,
				input.actualHours === undefined
					? existing.actualHours
					: input.actualHours,
				assignmentRows,
			);
			return tx.engagement.update({
				where: { id },
				data: { ...scalarData(rest), ...financials },
				include,
			});
		});
		return serializeEngagement(row);
	}

	async delete(id: string) {
		try {
			await this.db.engagement.delete({ where: { id } });
		} catch {
			throw new NotFoundException(`No engagement with id ${id}.`);
		}
		return { id };
	}

	async listTeamMembers(
		input: z.infer<typeof teamMemberListInput>,
	): Promise<ListResult<TeamMemberRow>> {
		const search: Prisma.TeamMemberWhereInput = input.q
			? {
					OR: [
						{ name: { contains: input.q, mode: "insensitive" } },
						{ email: { contains: input.q, mode: "insensitive" } },
						{ role: { contains: input.q, mode: "insensitive" } },
					],
				}
			: {};
		const status: Prisma.TeamMemberWhereInput =
			input.status === "ACTIVE" || input.status === "INACTIVE"
				? { status: input.status }
				: {};
		const employment: Prisma.TeamMemberWhereInput =
			input.employmentType === "EMPLOYEE" ||
			input.employmentType === "CONTRACTOR" ||
			input.employmentType === "AGENCY"
				? { employmentType: input.employmentType }
				: {};
		const where = { ...search, ...status, ...employment };
		const { skip, take } = paginate(input);

		const [rows, total, statusGroups, employmentGroups] = await Promise.all([
			this.db.teamMember.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, TEAM_MEMBER_SORTABLE, [
					{ status: "asc" },
					{ name: "asc" },
				]),
			}),
			this.db.teamMember.count({ where }),
			this.db.teamMember.groupBy({
				by: ["status"],
				where: { ...search, ...employment },
				_count: { _all: true },
			}),
			this.db.teamMember.groupBy({
				by: ["employmentType"],
				where: { ...search, ...status },
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map(serializeTeamMember),
			total,
			facetCounts: {
				status: countsByKey(statusGroups, "status"),
				employmentType: countsByKey(employmentGroups, "employmentType"),
			},
		};
	}

	async teamMember(id: string) {
		const row = await this.db.teamMember.findUnique({ where: { id } });
		if (!row) throw new NotFoundException(`No team member with id ${id}.`);
		return serializeTeamMember(row);
	}

	async createTeamMember(input: z.infer<typeof teamMemberCreateInput>) {
		const row = await this.db.teamMember.create({
			data: teamMemberData(input),
		});
		return serializeTeamMember(row);
	}

	async updateTeamMember(
		id: string,
		input: z.infer<typeof teamMemberUpdateArgs>["data"],
	) {
		try {
			const row = await this.db.teamMember.update({
				where: { id },
				data: teamMemberData(input),
			});
			return serializeTeamMember(row);
		} catch {
			throw new NotFoundException(`No team member with id ${id}.`);
		}
	}

	private async assertReferences(
		companyId: string,
		sourceDealId: string | null | undefined,
		deliveryLeadId: string | null | undefined,
	) {
		const [company, deal, lead] = await Promise.all([
			this.db.company.findUnique({
				where: { id: companyId },
				select: { id: true },
			}),
			sourceDealId
				? this.db.deal.findUnique({
						where: { id: sourceDealId },
						select: { id: true, companyId: true },
					})
				: null,
			deliveryLeadId
				? this.db.teamMember.findUnique({
						where: { id: deliveryLeadId },
						select: { id: true },
					})
				: null,
		]);
		if (!company)
			throw new NotFoundException(`No company with id ${companyId}.`);
		if (sourceDealId && !deal)
			throw new NotFoundException(`No deal with id ${sourceDealId}.`);
		if (deal && deal.companyId !== companyId)
			throw new BadRequestException(
				"The source deal must belong to the engagement company.",
			);
		if (deliveryLeadId && !lead)
			throw new NotFoundException(`No team member with id ${deliveryLeadId}.`);
	}
}

function scalarData(
	input: Record<string, unknown>,
): Prisma.EngagementUncheckedCreateInput {
	const data: Record<string, unknown> = { ...input };
	delete data.assignments;
	for (const key of ["startDate", "endDate"]) {
		if (typeof data[key] === "string")
			data[key] = new Date(data[key] as string);
	}
	return data as Prisma.EngagementUncheckedCreateInput;
}

function teamMemberData(
	input: Record<string, unknown>,
): Prisma.TeamMemberUncheckedCreateInput {
	const data: Record<string, unknown> = { ...input };
	for (const key of ["startDate", "endDate"]) {
		if (typeof data[key] === "string")
			data[key] = new Date(data[key] as string);
	}
	return data as Prisma.TeamMemberUncheckedCreateInput;
}

function serializeTeamMember(row: Prisma.TeamMemberGetPayload<object>) {
	return {
		...row,
		hourlyCost: numberOrNull(row.hourlyCost),
		weeklyCapacity: numberOrNull(row.weeklyCapacity),
		startDate: row.startDate?.toISOString() ?? null,
		endDate: row.endDate?.toISOString() ?? null,
	};
}

function serializeEngagement(row: EngagementRow) {
	return {
		...row,
		contractValue: numberOrNull(row.contractValue),
		estimatedHours: numberOrNull(row.estimatedHours),
		actualHours: numberOrNull(row.actualHours),
		deliveryCost: numberOrNull(row.deliveryCost),
		grossMargin: numberOrNull(row.grossMargin),
		startDate: row.startDate?.toISOString() ?? null,
		endDate: row.endDate?.toISOString() ?? null,
		assignments: row.assignments.map((assignment: EngagementAssignmentRow) => ({
			...assignment,
			estimatedHours: numberOrNull(assignment.estimatedHours),
			actualHours: numberOrNull(assignment.actualHours),
			hourlyCostSnapshot: numberOrNull(assignment.hourlyCostSnapshot),
			teamMember: serializeTeamMember(assignment.teamMember),
		})),
	};
}

function numberOrNull(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

function calculateFinancials(
	contractValue: unknown,
	actualHours: unknown,
	assignments: readonly {
		actualHours?: unknown;
		hourlyCostSnapshot?: unknown;
	}[],
) {
	const explicitHours = numberOrNull(actualHours);
	const allHoursKnown =
		assignments.length > 0 &&
		assignments.every(
			(assignment) => numberOrNull(assignment.actualHours) !== null,
		);
	const hours =
		explicitHours ??
		(allHoursKnown
			? assignments.reduce(
					(sum, assignment) =>
						sum + (numberOrNull(assignment.actualHours) ?? 0),
					0,
				)
			: null);
	const allCostsKnown =
		assignments.length > 0 &&
		assignments.every(
			(assignment) =>
				numberOrNull(assignment.actualHours) !== null &&
				numberOrNull(assignment.hourlyCostSnapshot) !== null,
		);
	const cost = allCostsKnown
		? assignments.reduce(
				(sum, assignment) =>
					sum +
					(numberOrNull(assignment.actualHours) ?? 0) *
						(numberOrNull(assignment.hourlyCostSnapshot) ?? 0),
				0,
			)
		: null;
	const revenue = numberOrNull(contractValue);
	return {
		actualHours: hours,
		deliveryCost: cost,
		grossMargin: revenue !== null && cost !== null ? revenue - cost : null,
	};
}
