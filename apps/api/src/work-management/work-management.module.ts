import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { WorkManagementController } from "./work-management.controller";
import { WorkManagementRouter } from "./work-management.router";
import { WorkManagementService } from "./work-management.service";

@Module({
	imports: [TrpcModule],
	providers: [WorkManagementRouter, WorkManagementService],
	controllers: [WorkManagementController],
	exports: [WorkManagementService],
})
export class WorkManagementModule {}
