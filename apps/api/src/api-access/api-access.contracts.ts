import { z } from "zod";
import { API_SCOPES } from "./api-access.constants";

export const createApiTokenInput = z.object({
	name: z.string().trim().min(1).max(80),
	scopes: z.array(z.enum(API_SCOPES)).min(1),
	expiresAt: z.string().datetime().nullable().optional(),
});

export const revokeApiTokenInput = z.object({ id: z.string().min(1) });

export type CreateApiTokenInput = z.infer<typeof createApiTokenInput>;
