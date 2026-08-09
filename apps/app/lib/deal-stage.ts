import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const ORDER = [
	DealStage.DISCOVERY,
	DealStage.QUALIFIED,
	DealStage.SCOPING,
	DealStage.PROPOSAL,
	DealStage.NEGOTIATION,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
] as const;

const PRESENTATION: Record<DealStage, { label: string; tone: StatusTone }> = {
	DISCOVERY: { label: "Discovery", tone: "neutral" },
	QUALIFIED: { label: "Qualified", tone: "info" },
	SCOPING: { label: "Scoping", tone: "info" },
	PROPOSAL: { label: "Proposal", tone: "warning" },
	NEGOTIATION: { label: "Negotiation", tone: "warning" },
	CLOSED_WON: { label: "Closed won", tone: "success" },
	CLOSED_LOST: { label: "Closed lost", tone: "error" },
};

export const OPEN_STAGES = ORDER.slice(0, 5) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [DealStage.CLOSED_LOST];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

const OPEN_STAGE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
] as const;

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return OPEN_STAGE_COLORS[OPEN_STAGES.indexOf(stage)] ?? "var(--chart-5)";
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}
