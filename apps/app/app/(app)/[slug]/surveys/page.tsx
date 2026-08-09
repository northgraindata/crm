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

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysPage({
	params,
}: PageProps<"/[slug]/surveys">) {
	const { slug } = await params;
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Surveys</PageShellTitle>
					<PageShellDescription>
						Live responses, partial submissions and analysis across every form.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent className="min-h-0 overflow-auto">
				<Suspense fallback={<PageShellLoading />}>
					<SurveyOverview slug={slug} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function SurveyOverview({ slug }: { slug: string }) {
	await requireSession();
	const client = getServerQueryClient();
	const trpc = getServerTrpc();
	const surveys = (await client.fetchQuery(
		trpc.surveys.list.queryOptions({}),
	)) as SurveySummary[];
	const responses = (await client.fetchQuery(
		trpc.surveys.responses.queryOptions({ limit: 50 }),
	)) as SurveyResponses;

	return (
		<div className="flex flex-col gap-6">
			{surveys.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No survey responses yet</CardTitle>
						<CardDescription>
							Responses will appear here as people move through any connected
							form, including incomplete sessions.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{surveys.map((survey) => (
						<Card key={survey.id}>
							<CardHeader>
								<CardTitle>{survey.name}</CardTitle>
								<CardDescription>{survey.slug}</CardDescription>
							</CardHeader>
							<CardContent className="flex justify-between text-sm">
								<span>{survey._count.responses} responses</span>
								<span className="text-muted-foreground">
									{survey.status.toLowerCase()}
								</span>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Recent responses</CardTitle>
					<CardDescription>
						Progress is saved as each answer arrives, so an abandoned form
						remains available for review.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{responses.rows.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No responses recorded.
						</p>
					) : (
						responses.rows.map((response) => (
							<Link
								key={response.id}
								href={`/${slug}/surveys/${response.id}`}
								className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm transition-colors hover:bg-muted"
							>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{response.respondentName}
									</span>
									<span className="block truncate text-muted-foreground">
										{response.survey.name} · {response.currentIndex + 1}/
										{response.questionCount}
									</span>
								</span>
								<span className="shrink-0 text-muted-foreground">
									{response.analysisStatus.toLowerCase()}
								</span>
							</Link>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

type SurveySummary = {
	id: string;
	slug: string;
	name: string;
	status: string;
	_count: { responses: number };
};

type SurveyResponses = {
	rows: Array<{
		id: string;
		respondentName: string;
		survey: { name: string };
		currentIndex: number;
		questionCount: number;
		analysisStatus: string;
	}>;
};
