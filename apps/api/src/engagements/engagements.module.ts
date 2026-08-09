import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { EngagementsRouter } from "./engagements.router";
import { EngagementsService } from "./engagements.service";

@Module({
	imports: [TrpcModule],
	providers: [EngagementsRouter, EngagementsService],
	exports: [EngagementsService],
})
export class EngagementsModule {}
