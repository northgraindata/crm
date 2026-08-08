import { z } from "zod";

export const zohoConnectionInput = z.object({
	connectionId: z.string().min(1),
});

export const setZohoAutoCreateInput = z.object({
	syncId: z.string().min(1),
	enabled: z.boolean(),
});
