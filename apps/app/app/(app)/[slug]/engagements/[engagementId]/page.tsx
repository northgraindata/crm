import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getServerTrpcClient } from "@/lib/trpc/server";
import { WorkTaskBoard } from "./work-task-board";

export const metadata: Metadata = { title: "Engagement" };
export const instant = false;

export default async function EngagementPage({
	params,
}: PageProps<"/[slug]/engagements/[engagementId]">) {
	await requireSession();
	const { slug, engagementId } = await params;
	const engagement = await getServerTrpcClient()
		.engagements.byId.query({ id: engagementId })
		.catch(() => null);
	if (!engagement) notFound();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:p-8">
			<div>
				<Link
					href={`/${slug}/engagements`}
					className="text-muted-foreground text-sm hover:text-foreground"
				>
					Back to delivery
				</Link>
				<h1 className="mt-3 font-semibold text-2xl">{engagement.name}</h1>
				<p className="text-muted-foreground text-sm">
					{engagement.company.name} · {engagement.status.toLowerCase()}
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-4">
				<Metric
					label="Hours"
					value={`${engagement.actualHours ?? 0} / ${engagement.estimatedHours ?? "—"}`}
				/>
				<Metric
					label="Contract"
					value={`${engagement.contractValue ?? "—"} ${engagement.currency}`}
				/>
				<Metric
					label="Delivery cost"
					value={
						engagement.deliveryCost === null
							? "—"
							: `${engagement.deliveryCost} ${engagement.currency}`
					}
				/>
				<Metric
					label="Gross margin"
					value={
						engagement.grossMargin === null
							? "—"
							: `${engagement.grossMargin} ${engagement.currency}`
					}
				/>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Work board</CardTitle>
				</CardHeader>
				<CardContent>
					<WorkTaskBoard engagementId={engagement.id} />
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<p className="text-muted-foreground text-sm">{label}</p>
			</CardHeader>
			<CardContent>
				<p className="font-medium tabular-nums">{value}</p>
			</CardContent>
		</Card>
	);
}
