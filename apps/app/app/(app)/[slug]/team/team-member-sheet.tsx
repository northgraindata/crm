"use client";

import Notification from "@carbon/icons-react/es/Notification";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Button } from "@crm/ui/components/button";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	DetailSheet,
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetHeader,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	DetailSheetTabs,
} from "@/components/detail-sheet";
import { LocalDay } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { TeamDocuments } from "./team-documents";
import {
	EMPLOYMENT_LABEL,
	STATUS_LABEL,
	TeamMemberForm,
} from "./team-member-form";

type TeamMember = RouterOutputs["engagements"]["teamMember"];

const REMINDER_COLUMNS = [
	{ id: "document", header: "Document", width: "w-[48%]" },
	{ id: "due", header: "Due", width: "w-[24%]" },
	{ id: "channel", header: "Channel", width: "w-[16%]" },
	{ id: "action", header: "", srLabel: "Actions", width: "w-[12%]" },
];

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function TeamMemberSheet({
	memberId,
	month,
	onOpenChange,
}: {
	memberId: string | null;
	month: string;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const [tab, setTab] = useState("details");
	const member = useQuery({
		...trpc.engagements.teamMember.queryOptions({ id: memberId ?? "" }),
		enabled: memberId != null,
	});
	const documents = useQuery({
		...trpc.workManagement.documents.queryOptions({
			teamMemberId: memberId ?? "",
		}),
		enabled: memberId != null,
	});
	const reminders = useQuery({
		...trpc.workManagement.reminders.queryOptions({
			teamMemberId: memberId ?? "",
			status: "PENDING",
		}),
		enabled: memberId != null,
	});
	const payroll = useQuery(trpc.workManagement.payroll.queryOptions({ month }));
	const currency = useQuery(trpc.currency.settings.queryOptions());

	return (
		<DetailSheet open={memberId != null} onOpenChange={onOpenChange}>
			{member.data ? (
				<MemberContent
					member={member.data}
					documents={documents.data?.length ?? 0}
					reminders={reminders.data ?? []}
					payroll={payroll.data?.find(
						(row) => row.teamMember.id === member.data?.id,
					)}
					currency={currency.data?.reportingCurrency ?? "USD"}
					tab={tab}
					onTabChange={setTab}
					onClose={() => onOpenChange(false)}
				/>
			) : member.isError ? (
				<>
					<DetailSheetHeader
						title="Team member unavailable"
						onClose={() => onOpenChange(false)}
					/>
					<DetailSheetEmpty
						icon={WarningAlt}
						title="This team member could not be loaded"
						description={member.error.message}
					/>
				</>
			) : (
				<>
					<DetailSheetHeader
						title="Team member"
						onClose={() => onOpenChange(false)}
					/>
					<div
						className="flex flex-1 items-center justify-center"
						aria-busy="true"
					>
						<Spinner size="lg" />
					</div>
				</>
			)}
		</DetailSheet>
	);
}

function MemberContent({
	member,
	documents,
	reminders,
	payroll,
	currency,
	tab,
	onTabChange,
	onClose,
}: {
	member: TeamMember;
	documents: number;
	reminders: RouterOutputs["workManagement"]["reminders"];
	payroll?: { hours: number; cost: number };
	currency: string;
	tab: string;
	onTabChange: (tab: string) => void;
	onClose: () => void;
}) {
	return (
		<>
			<DetailSheetHeader
				media={
					<PersonAvatar name={member.name} email={member.email} size="lg" />
				}
				title={member.name}
				description={member.role ?? EMPLOYMENT_LABEL[member.employmentType]}
				note={
					<StatusIndicator
						tone={member.status === "ACTIVE" ? "success" : "neutral"}
						label={STATUS_LABEL[member.status]}
						size="sm"
					/>
				}
				onClose={onClose}
			/>
			<DetailSheetStats>
				<DetailSheetStat label="Hours this month">
					{number.format(payroll?.hours ?? 0)} h
				</DetailSheetStat>
				<DetailSheetStat label="Estimated cost">
					{formatMoney(Math.round((payroll?.cost ?? 0) * 100), currency)}
				</DetailSheetStat>
				<DetailSheetStat label="Weekly capacity">
					{member.weeklyCapacity == null
						? "—"
						: `${number.format(member.weeklyCapacity)} h`}
				</DetailSheetStat>
			</DetailSheetStats>
			<DetailSheetTabs
				value={tab}
				onValueChange={onTabChange}
				tabs={[
					{
						value: "details",
						label: "Details",
						content: <MemberDetails member={member} />,
					},
					{
						value: "documents",
						label: "Documents",
						count: documents,
						content: <TeamDocuments memberId={member.id} />,
					},
					{
						value: "reminders",
						label: "Reminders",
						count: reminders.length,
						content: (
							<TeamReminders memberId={member.id} reminders={reminders} />
						),
					},
				]}
			/>
		</>
	);
}

function MemberDetails({ member }: { member: TeamMember }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const update = useMutation(
		trpc.engagements.updateTeamMember.mutationOptions({
			onSuccess: async () => {
				await cache.team(member.id);
				toast.success("Team member updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DetailSheetBody>
			<DetailSheetSection title="Profile">
				<TeamMemberForm
					formId={`edit-team-member-${member.id}`}
					initialValue={member}
					onSubmit={(value) => update.mutate({ id: member.id, data: value })}
				/>
				<div className="flex justify-end pt-4">
					<Button
						type="submit"
						form={`edit-team-member-${member.id}`}
						disabled={update.isPending}
					>
						{update.isPending ? <Spinner /> : null}
						Save changes
					</Button>
				</div>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function TeamReminders({
	memberId,
	reminders,
}: {
	memberId: string;
	reminders: RouterOutputs["workManagement"]["reminders"];
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const complete = useMutation(
		trpc.workManagement.completeReminder.mutationOptions({
			onSuccess: async () => {
				await cache.team(memberId);
				toast.success("Reminder completed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (reminders.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Notification}
				title="No pending reminders"
				description="Upcoming document dates that need attention will appear here."
			/>
		);
	}

	return (
		<SimpleTable variant="panel" columns={REMINDER_COLUMNS}>
			{reminders.map((reminder) => (
				<SimpleTableRow key={reminder.id}>
					<TableCell className="py-2.5 pl-5 font-medium">
						{reminder.document.label}
					</TableCell>
					<TableCell className="text-muted-foreground">
						<LocalDay date={reminder.dueAt} />
					</TableCell>
					<TableCell className="text-muted-foreground">
						{reminder.channel.toLowerCase()}
					</TableCell>
					<TableCell className="pr-5 text-right">
						<Button
							variant="ghost"
							size="sm"
							disabled={complete.isPending}
							onClick={() => complete.mutate({ id: reminder.id })}
						>
							Done
						</Button>
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
