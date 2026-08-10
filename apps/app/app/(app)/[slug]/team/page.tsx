import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateTeamMemberSheet } from "./create-team-member-sheet";
import { teamSearchParams } from "./team-search-params";
import { TeamTable } from "./team-table";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage({ searchParams }: PageProps<"/[slug]/team">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Team</PageShellTitle>
					<PageShellDescription>
						Everyone working across your engagements.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateTeamMemberSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Team searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Team({
	searchParams,
}: Pick<PageProps<"/[slug]/team">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		teamSearchParams.load(searchParams),
	]);
	const month = new Date().toISOString().slice(0, 7);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.engagements.teamMembers.queryOptions(
				teamSearchParams.toInput(values),
			),
		),
		queryClient.prefetchQuery(
			trpc.workManagement.payroll.queryOptions({ month }),
		),
		queryClient.prefetchQuery(trpc.currency.settings.queryOptions()),
	]);

	return (
		<HydrateClient>
			<TeamTable month={month} />
		</HydrateClient>
	);
}
