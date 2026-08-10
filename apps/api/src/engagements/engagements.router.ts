import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	engagementCreateInput,
	engagementIdInput,
	engagementListInput,
	engagementUpdateArgs,
	teamMemberCreateInput,
	teamMemberIdInput,
	teamMemberListInput,
	teamMemberUpdateArgs,
} from "./engagements.contracts";
import { EngagementsService } from "./engagements.service";

@Router({ alias: "engagements" })
@UseMiddlewares(AuthMiddleware)
export class EngagementsRouter {
	constructor(
		@Inject(EngagementsService)
		private readonly engagements: EngagementsService,
	) {}

	@Query({ input: engagementListInput })
	async list(@Input() input: z.infer<typeof engagementListInput>) {
		return this.engagements.list(input);
	}

	@Query({ input: engagementIdInput })
	async byId(@Input("id") id: string) {
		return this.engagements.byId(id);
	}

	@Mutation({ input: engagementCreateInput })
	async create(@Input() input: z.infer<typeof engagementCreateInput>) {
		return this.engagements.create(input);
	}

	@Mutation({ input: engagementUpdateArgs })
	async update(@Input() input: z.infer<typeof engagementUpdateArgs>) {
		return this.engagements.update(input.id, input.data);
	}

	@Mutation({ input: engagementIdInput })
	async delete(@Input("id") id: string) {
		return this.engagements.delete(id);
	}

	@Query({ input: teamMemberListInput })
	async teamMembers(@Input() input: z.infer<typeof teamMemberListInput>) {
		return this.engagements.listTeamMembers(input);
	}

	@Query({ input: teamMemberIdInput })
	async teamMember(@Input("id") id: string) {
		return this.engagements.teamMember(id);
	}

	@Mutation({ input: teamMemberCreateInput })
	async createTeamMember(
		@Input() input: z.infer<typeof teamMemberCreateInput>,
	) {
		return this.engagements.createTeamMember(input);
	}

	@Mutation({ input: teamMemberUpdateArgs })
	async updateTeamMember(@Input() input: z.infer<typeof teamMemberUpdateArgs>) {
		return this.engagements.updateTeamMember(input.id, input.data);
	}
}
