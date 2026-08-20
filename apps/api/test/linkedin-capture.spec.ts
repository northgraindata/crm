import { describe, expect, it } from "bun:test";
import { linkedinCaptureInput } from "../src/api-access/linkedin-capture.contracts";
import { LinkedInCaptureService } from "../src/api-access/linkedin-capture.service";

const capture = {
	profileUrl: "https://www.linkedin.com/in/Jane-Doe/",
	firstName: "Jane",
	imageUrl: "https://media.licdn.com/profile.jpg",
	reason: "Relationship" as const,
};

function harness(options?: {
	existing?: boolean;
	previousStatus?: string | null;
	existingTask?: boolean;
}) {
	let contact = options?.existing
		? { id: "contact-1", companyId: null as string | null }
		: null;
	const contactCreates: Record<string, unknown>[] = [];
	const contactUpdates: Record<string, unknown>[] = [];
	const companyCreates: Record<string, unknown>[] = [];
	const fieldWrites: Array<{
		entity: string;
		recordId: string;
		values: Record<string, unknown>;
	}> = [];
	const locks: string[] = [];
	let activityCreates = 0;
	const tx = {
		$queryRaw: async (strings: TemplateStringsArray, key: string) => {
			locks.push(key);
			return [{ locked: true, sql: strings.join("") }];
		},
		contact: {
			findUnique: async () => contact,
			findFirst: async () => null,
			create: async ({ data }: { data: Record<string, unknown> }) => {
				contactCreates.push(data);
				contact = {
					id: "contact-1",
					companyId: (data.companyId as string) ?? null,
				};
				return { id: "contact-1" };
			},
			update: async ({ data }: { data: Record<string, unknown> }) => {
				contactUpdates.push(data);
				return { id: "contact-1" };
			},
		},
		company: {
			findUnique: async () => null,
			findFirst: async () => null,
			create: async ({ data }: { data: Record<string, unknown> }) => {
				companyCreates.push(data);
				return { id: "company-1" };
			},
			update: async () => ({ id: "company-1" }),
		},
		fieldValue: {
			findFirst: async () =>
				options?.previousStatus
					? { option: { label: options.previousStatus } }
					: null,
		},
		suppressedContact: { deleteMany: async () => ({ count: 0 }) },
		activity: {
			findFirst: async () => (options?.existingTask ? { id: "task-1" } : null),
			create: async () => {
				activityCreates += 1;
				return { id: "task-1" };
			},
		},
	};
	const db = {
		$transaction: async (run: (client: typeof tx) => unknown) => run(tx),
	};
	const fields = {
		applyValues: async (
			_client: unknown,
			entity: string,
			recordId: string,
			values: Record<string, unknown>,
		) => fieldWrites.push({ entity, recordId, values }),
	};
	const agent = {
		companyCreated: async () => undefined,
		contactCreated: async () => undefined,
		backfill: async () => ({ queued: 1, alreadyQueued: 0 }),
	};
	return {
		service: new LinkedInCaptureService(
			db as never,
			fields as never,
			agent as never,
		),
		contactCreates,
		contactUpdates,
		companyCreates,
		fieldWrites,
		locks,
		activityCreates: () => activityCreates,
	};
}

describe("LinkedIn capture", () => {
	it("defaults follow-up creation to false", () => {
		expect(linkedinCaptureInput.parse(capture).createFollowUp).toBe(false);
	});

	it("writes the canonical identity, company, and fields in one transaction", async () => {
		const context = harness();
		await context.service.capture(
			linkedinCaptureInput.parse({
				...capture,
				email: "JANE@EXAMPLE.COM",
				title: "Data Engineer II",
				headline: "Data Engineer II | GCP | Apache Beam",
				location: "Pune Division, Maharashtra, India",
				companyName: "Infocusp Innovations",
				companyWebsite: "https://infocusp.com/company/",
				companyLinkedInUrl:
					"https://www.linkedin.com/company/infocusp-innovations/",
				connectionStatus: "unknown",
			}),
			"user-1",
		);

		expect(context.locks).toEqual(["linkedin:jane-doe"]);
		expect(context.companyCreates[0]).toMatchObject({
			name: "Infocusp Innovations",
			domain: "infocusp.com",
			website: "https://infocusp.com/company/",
			linkedinUrl: "https://www.linkedin.com/company/infocusp-innovations/",
		});
		expect(context.contactCreates[0]).toMatchObject({
			linkedinKey: "jane-doe",
			linkedinUrl: "https://www.linkedin.com/in/jane-doe",
			email: "jane@example.com",
			companyId: "company-1",
			status: "TO_RESEARCH",
			ownerId: "user-1",
		});
		expect(context.fieldWrites).toContainEqual({
			entity: "CONTACT",
			recordId: "contact-1",
			values: expect.objectContaining({
				linkedin_headline: "Data Engineer II | GCP | Apache Beam",
				linkedin_location: "Pune Division, Maharashtra, India",
				linkedin_connection_status: "Unknown",
			}),
		});
	});

	it("does not downgrade a known connection status with unknown", async () => {
		const context = harness({ existing: true, previousStatus: "Connected" });
		await context.service.capture(
			linkedinCaptureInput.parse({ ...capture, connectionStatus: "unknown" }),
			"user-1",
		);

		const values = context.fieldWrites.find(
			(write) => write.entity === "CONTACT",
		)?.values;
		expect(values?.linkedin_connection_status).toBeUndefined();
		expect(context.contactCreates).toHaveLength(0);
		expect(context.contactUpdates).toHaveLength(1);
	});

	it("creates at most one open LinkedIn follow-up on replay", async () => {
		const context = harness({ existing: true, existingTask: true });
		const result = await context.service.capture(
			linkedinCaptureInput.parse({
				...capture,
				connectionStatus: "connected",
				createFollowUp: true,
			}),
			"user-1",
		);

		expect(result.taskId).toBe("task-1");
		expect(context.activityCreates()).toBe(0);
	});

	it("does not create a task merely because a connection became connected", async () => {
		const context = harness({ existing: true, previousStatus: "Invited us" });
		const result = await context.service.capture(
			linkedinCaptureInput.parse({
				...capture,
				connectionStatus: "connected",
				createFollowUp: false,
			}),
			"user-1",
		);

		expect(result.transitioned).toBe(true);
		expect(result.taskId).toBeNull();
		expect(context.activityCreates()).toBe(0);
	});
});
