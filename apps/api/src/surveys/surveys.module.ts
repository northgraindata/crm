import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { SurveysRouter } from "./surveys.router";
import { SurveysService } from "./surveys.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [SurveysRouter, SurveysService],
	exports: [SurveysService],
})
export class SurveysModule {}
