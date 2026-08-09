import { z } from "zod";

export const linkedinCaptureInput = z.object({
	profileUrl: z.string().url(),
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().optional(),
	title: z.string().trim().optional(),
	companyName: z.string().trim().optional(),
	companyDomain: z.string().trim().optional(),
	companyLinkedInUrl: z.string().url().optional(),
	reason: z.enum([
		"Potential client",
		"Partner",
		"Recruiter",
		"Relationship",
		"Other",
	]),
	inbound: z.boolean().default(false),
	connectionStatus: z
		.enum([
			"invited_by_us",
			"invited_us",
			"connected",
			"not_connected",
			"unknown",
		])
		.optional(),
	connectedAt: z.string().datetime().optional(),
	createFollowUp: z.boolean().default(false),
	followUpSubject: z.string().trim().optional(),
	followUpBody: z.string().trim().optional(),
	followUpDueAt: z.string().datetime().optional(),
});

export type LinkedInCaptureInput = z.infer<typeof linkedinCaptureInput>;
