import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { ApiTokenPrincipal } from "./api-access.constants";
import { ApiAccessService } from "./api-access.service";

export type ApiRequest = Request & { apiToken?: ApiTokenPrincipal };

@Injectable()
export class ApiAccessGuard implements CanActivate {
	constructor(private readonly access: ApiAccessService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<ApiRequest>();
		const authorization = request.header("authorization");
		const token = authorization?.startsWith("Bearer ")
			? authorization.slice("Bearer ".length).trim()
			: undefined;
		request.apiToken = await this.access.authenticate(token);
		return true;
	}
}
