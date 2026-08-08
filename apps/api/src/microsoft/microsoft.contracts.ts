import { z } from "zod";
export const setOutlookAutoCreateInput = z.object({
	syncId: z.string().min(1),
	enabled: z.boolean(),
});

export const microsoftConnectionInput = z.object({
	connectionId: z.string().min(1),
});

export type SetOutlookAutoCreateInput = z.infer<
	typeof setOutlookAutoCreateInput
>;
