import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Create one manual CRM follow-up task for a contact. Use after researching a LinkedIn relationship. The task body may contain a suggested message, but never send or automate the message.",
	inputSchema: z.object({
		contactId: z.string(),
		subject: z.string().trim().min(1),
		body: z.string().trim().min(1),
		dueAt: z.string().datetime().optional(),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);

		const contact = await db.contact.findUnique({
			where: { id: input.contactId },
			select: { id: true, companyId: true, ownerId: true, firstName: true },
		});
		if (!contact)
			return { created: false as const, reason: "No such contact." };

		const author =
			contact.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id;
		if (!author)
			return {
				created: false as const,
				reason: "No CRM user can own the task.",
			};

		const existing = await db.activity.findFirst({
			where: {
				type: ActivityType.TASK,
				contactId: contact.id,
				completedAt: null,
				meta: { path: ["source"], equals: "linkedin" },
			},
			select: { id: true },
		});
		if (existing)
			return {
				created: false as const,
				reason: "A LinkedIn follow-up task already exists.",
				activityId: existing.id,
			};

		const activity = await db.activity.create({
			data: {
				type: ActivityType.TASK,
				subject: input.subject,
				body: input.body,
				dueAt: input.dueAt ? new Date(input.dueAt) : new Date(),
				occurredAt: new Date(),
				contactId: contact.id,
				companyId: contact.companyId,
				createdById: author,
				meta: { source: "linkedin", draft: true, agent: "relationship-triage" },
			},
			select: { id: true },
		});

		return {
			created: true as const,
			activityId: activity.id,
			contact: contact.firstName,
		};
	},
});
