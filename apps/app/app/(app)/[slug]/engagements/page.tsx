import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Delivery" };
export const instant = false;

export default async function EngagementsPage({
	params,
}: PageProps<"/[slug]/engagements">) {
	const { slug } = await params;
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Delivery</PageShellTitle>
					<PageShellDescription>
						Active and planned engagements, people and margin.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent className="min-h-0 overflow-auto">
				<Suspense fallback={<PageShellLoading />}>
					<Engagements slug={slug} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Engagements({ slug }: { slug: string }) {
	await requireSession();
	const rows = await getServerQueryClient().fetchQuery(
		getServerTrpc().engagements.list.queryOptions({ limit: 100 }),
	);

	return rows.length === 0 ? (
		<Card>
			<CardHeader>
				<CardTitle>No engagements yet</CardTitle>
				<CardDescription>
					Create an engagement from a won deal when delivery begins.
				</CardDescription>
			</CardHeader>
		</Card>
	) : (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{rows.map((engagement) => (
				<Card key={engagement.id}>
					<Link
						href={`/${slug}/engagements/${engagement.id}`}
						className="block"
					>
						<CardHeader>
							<CardTitle>{engagement.name}</CardTitle>
							<CardDescription>
								{engagement.company.name} · {engagement.status.toLowerCase()}
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-2 text-sm">
							<div className="flex justify-between">
								<span>Type</span>
								<span>{engagement.type.toLowerCase()}</span>
							</div>
							<div className="flex justify-between">
								<span>Contract</span>
								<span>
									{engagement.contractValue === null
										? "—"
										: `${engagement.contractValue} ${engagement.currency}`}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Hours</span>
								<span>
									{engagement.actualHours ?? "—"} /{" "}
									{engagement.estimatedHours ?? "—"}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Margin</span>
								<span>
									{engagement.grossMargin === null
										? "Pending actuals"
										: `${engagement.grossMargin} ${engagement.currency}`}
								</span>
							</div>
						</CardContent>
					</Link>
				</Card>
			))}
		</div>
	);
}
