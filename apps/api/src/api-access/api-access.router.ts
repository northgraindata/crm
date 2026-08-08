import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	createApiTokenInput,
	revokeApiTokenInput,
} from "./api-access.contracts";
import { ApiAccessService } from "./api-access.service";

@Router({ alias: "apiAccess" })
@UseMiddlewares(AuthMiddleware)
export class ApiAccessRouter {
	constructor(
		@Inject(ApiAccessService) private readonly access: ApiAccessService,
	) {}

	@Query()
	async tokens(@Ctx() ctx: { user: { id: string } }) {
		return this.access.list(ctx.user.id);
	}

	@Mutation({ input: createApiTokenInput })
	async createToken(
		@Ctx() ctx: { user: { id: string } },
		@Input() input: z.infer<typeof createApiTokenInput>,
	) {
		return this.access.create(ctx.user.id, input);
	}

	@Mutation({ input: revokeApiTokenInput })
	async revokeToken(
		@Ctx() ctx: { user: { id: string } },
		@Input("id") id: string,
	) {
		return this.access.revoke(ctx.user.id, id);
	}
}
