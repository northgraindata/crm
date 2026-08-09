import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getServerTrpcClient } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Survey response" };
export const instant = false;

export default async function SurveyResponsePage({
	params,
}: PageProps<"/[slug]/surveys/[responseId]">) {
	await requireSession();
	const { responseId } = await params;
	const getResponse = getServerTrpcClient().surveys.response
		.query as unknown as (input: { id: string }) => Promise<unknown>;
	const response = (await getResponse({ id: responseId }).catch(
		() => null,
	)) as SurveyResponseDetail | null;
	if (!response) notFound();

	const analysis = response.analysis;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:p-8">
			<div>
				<Link
					href=".."
					className="text-muted-foreground text-sm hover:text-foreground"
				>
					Back to surveys
				</Link>
				<h1 className="mt-3 font-semibold text-2xl">
					{response.respondentName}
				</h1>
				<p className="text-muted-foreground text-sm">
					{response.survey.name} · {response.respondentEmail}
				</p>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Response</CardTitle>
						<CardDescription>
							{response.status.toLowerCase()} · {response.currentIndex + 1}/
							{response.questionCount} questions
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 text-sm">
						{Object.entries(
							response.answers as Record<
								string,
								{ answer: string | string[]; other?: string }
							>,
						).map(([id, value]) => (
							<div key={id} className="border-b pb-3 last:border-0">
								<p className="font-medium">{id}</p>
								<p className="text-muted-foreground">
									{Array.isArray(value.answer)
										? value.answer.join(", ")
										: value.answer}
									{value.other ? ` · ${value.other}` : ""}
								</p>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Analysis</CardTitle>
						<CardDescription>
							{response.analysisStatus.toLowerCase()}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 text-sm">
						{analysis?.summary ? (
							<p>{analysis.summary}</p>
						) : (
							<p className="text-muted-foreground">
								Analysis will appear after the agent processes a completed
								response.
							</p>
						)}
						{analysis?.icpFit ? (
							<p>
								<span className="font-medium">ICP fit:</span> {analysis.icpFit}
							</p>
						) : null}
						{analysis?.recommendedNextAction ? (
							<p>
								<span className="font-medium">Next action:</span>{" "}
								{analysis.recommendedNextAction}
							</p>
						) : null}
						{analysis?.themes?.length ? (
							<div>
								<p className="font-medium">Themes</p>
								<ul className="list-disc pl-5 text-muted-foreground">
									{analysis.themes.map((theme) => (
										<li key={theme}>{theme}</li>
									))}
								</ul>
							</div>
						) : null}
						{analysis?.signals?.length ? (
							<div>
								<p className="font-medium">Signals</p>
								<ul className="list-disc pl-5 text-muted-foreground">
									{analysis.signals.map((signal) => (
										<li key={signal}>{signal}</li>
									))}
								</ul>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

type SurveyResponseDetail = {
	id: string;
	respondentName: string;
	respondentEmail: string;
	status: string;
	currentIndex: number;
	questionCount: number;
	answers: Record<string, { answer: string | string[]; other?: string }>;
	analysisStatus: string;
	analysis: {
		summary?: string;
		themes?: string[];
		signals?: string[];
		icpFit?: string;
		recommendedNextAction?: string;
		confidence?: number;
	} | null;
	survey: { name: string };
};
