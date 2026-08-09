import { DealStage } from "./generated/prisma/enums";

export const OPEN_DEAL_STAGES = [
	DealStage.DISCOVERY,
	DealStage.QUALIFIED,
	DealStage.SCOPING,
	DealStage.PROPOSAL,
	DealStage.NEGOTIATION,
] as const;

export const CLOSED_DEAL_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
] as const;

export const LOSING_DEAL_STAGES = [DealStage.CLOSED_LOST] as const;

const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);

export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}
