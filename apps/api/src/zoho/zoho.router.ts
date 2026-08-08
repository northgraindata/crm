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
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { setZohoAutoCreateInput, zohoConnectionInput } from "./zoho.contracts";
import { ZohoConnectionService } from "./zoho-connection.service";
import { ZohoSyncRunnerService } from "./zoho-sync-runner.service";

@Router({ alias: "zoho" })
@UseMiddlewares(AuthMiddleware)
export class ZohoRouter {
	constructor(
		@Inject(ZohoConnectionService)
		private readonly connection: ZohoConnectionService,
		@Inject(ZohoSyncRunnerService)
		private readonly sync: ZohoSyncRunnerService,
	) {}

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation()
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: zohoConnectionInput })
	async revokeAccess(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("connectionId") connectionId: string,
	) {
		return this.connection.revoke(ctx.user.id, connectionId);
	}

	@Mutation({ input: setZohoAutoCreateInput })
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setZohoAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.syncId,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}
}
