import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { TeamDocuments } from "./team-documents";

export const metadata: Metadata = { title: "Team" };
export const instant = false;

export default async function TeamPage() {
	return <TeamOverview />;
}

async function TeamOverview() {
	await requireSession();
	const month = new Date().toISOString().slice(0, 7);
	const client = getServerQueryClient();
	const trpc = getServerTrpc();
	const [members, payroll, reminders] = await Promise.all([
		client.fetchQuery(trpc.engagements.teamMembers.queryOptions({})),
		client.fetchQuery(trpc.workManagement.payroll.queryOptions({ month })),
		client.fetchQuery(
			trpc.workManagement.reminders.queryOptions({ status: "PENDING" }),
		),
	]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:p-8">
			<div>
				<h1 className="font-semibold text-2xl">Team HQ</h1>
				<p className="text-muted-foreground text-sm">
					People, hours, costs and expiring documents.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{members.map((member) => {
					const summary = payroll.find(
						(row) => row.teamMember.id === member.id,
					);
					return (
						<Card key={member.id}>
							<CardHeader>
								<CardTitle>{member.name}</CardTitle>
								<CardDescription>
									{member.role ?? member.employmentType.toLowerCase()}
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-2 text-sm">
								<div className="flex justify-between">
									<span>Hours this month</span>
									<span className="tabular-nums">
										{summary?.hours.toFixed(2) ?? "0.00"}
									</span>
								</div>
								<div className="flex justify-between">
									<span>Estimated cost</span>
									<span className="tabular-nums">
										{summary?.cost.toFixed(2) ?? "0.00"}
									</span>
								</div>
								<div className="flex justify-between">
									<span>Weekly capacity</span>
									<span className="tabular-nums">
										{member.weeklyCapacity ?? "—"}
									</span>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Add team document</CardTitle>
					<CardDescription>
						Store expiry dates and create CRM and email reminders.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TeamDocuments members={members} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Pending reminders</CardTitle>
					<CardDescription>
						Documents and contract dates that need attention.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{reminders.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No pending reminders.
						</p>
					) : (
						<div className="grid gap-2 text-sm">
							{reminders.map((reminder) => (
								<div
									key={reminder.id}
									className="flex justify-between border-b py-2 last:border-0"
								>
									<span>
										{reminder.document.teamMember.name} ·{" "}
										{reminder.document.label}
									</span>
									<span className="text-muted-foreground">
										{new Date(reminder.dueAt).toLocaleDateString()}
									</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
