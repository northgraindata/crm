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
import {
	microsoftConnectionInput,
	setOutlookAutoCreateInput,
} from "./microsoft.contracts";
import { MicrosoftConnectionService } from "./microsoft-connection.service";
import { MicrosoftSyncService } from "./microsoft-sync.service";

@Router({ alias: "microsoft" })
@UseMiddlewares(AuthMiddleware)
export class MicrosoftRouter {
	constructor(
		@Inject(MicrosoftConnectionService)
		private readonly connection: MicrosoftConnectionService,
		@Inject(MicrosoftSyncService)
		private readonly sync: MicrosoftSyncService,
	) {}

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: microsoftConnectionInput })
	async purgeSyncedData(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("connectionId") connectionId: string,
	) {
		return this.connection.purgeSyncedData(ctx.user.id, connectionId);
	}

	@Mutation({ input: microsoftConnectionInput })
	async revokeAccess(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("connectionId") connectionId: string,
	) {
		return this.connection.revoke(ctx.user.id, connectionId);
	}

	@Mutation()
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: setOutlookAutoCreateInput })
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setOutlookAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.syncId,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}
}
