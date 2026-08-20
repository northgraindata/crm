import type { ContactStatus } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

export const CONTACT_STATUS_OPTIONS = [
	{ value: "TO_RESEARCH", label: "To research", tone: "info" },
	{ value: "READY_TO_CONTACT", label: "Ready to contact", tone: "info" },
	{
		value: "CONTACTED_AWAITING_REPLY",
		label: "Contacted — awaiting reply",
		tone: "warning",
	},
	{
		value: "ACTIVE_CONVERSATION",
		label: "Active conversation",
		tone: "primary",
	},
	{ value: "FOLLOW_UP_DUE", label: "Follow-up due", tone: "warning" },
	{ value: "NURTURE", label: "Nurture", tone: "neutral" },
	{ value: "CLOSED_IRRELEVANT", label: "Closed / irrelevant", tone: "neutral" },
] satisfies Array<{
	value: ContactStatus;
	label: string;
	tone: StatusTone;
}>;

export function contactStatusPresentation(status: ContactStatus) {
	return CONTACT_STATUS_OPTIONS.find((option) => option.value === status);
}
