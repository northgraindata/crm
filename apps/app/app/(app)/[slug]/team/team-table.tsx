"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalDay } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { EMPLOYMENT_LABEL, STATUS_LABEL } from "./team-member-form";
import { TeamMemberSheet } from "./team-member-sheet";
import { teamSearchParams } from "./team-search-params";

type TeamMemberRow =
	RouterOutputs["engagements"]["teamMembers"]["rows"][number];

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function columns(
	payroll: Map<string, { hours: number; cost: number }>,
	currency: string,
): DataTableColumn<TeamMemberRow>[] {
	return [
		{
			id: "name",
			header: "Name",
			sortable: true,
			hideable: false,
			width: "w-[24%]",
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<PersonAvatar name={row.name} email={row.email} size="sm" />
					<span className="min-w-0">
						<span className="block truncate font-medium">{row.name}</span>
						{row.email ? (
							<span className="block truncate text-muted-foreground text-xs">
								{row.email}
							</span>
						) : null}
					</span>
				</span>
			),
		},
		{
			id: "role",
			header: "Role",
			sortable: true,
			width: "w-[18%]",
			cell: (row) =>
				row.role ? (
					<span className="truncate">{row.role}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "status",
			header: "Status",
			sortable: true,
			width: "w-[12%]",
			cell: (row) => (
				<StatusIndicator
					tone={row.status === "ACTIVE" ? "success" : "neutral"}
					label={STATUS_LABEL[row.status]}
					size="sm"
				/>
			),
		},
		{
			id: "employmentType",
			header: "Employment",
			label: "Employment type",
			sortable: true,
			width: "w-[14%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="text-muted-foreground">
					{EMPLOYMENT_LABEL[row.employmentType]}
				</span>
			),
		},
		{
			id: "weeklyCapacity",
			header: "Capacity",
			label: "Weekly capacity",
			sortable: true,
			align: "right",
			width: "w-[10%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="text-muted-foreground tabular-nums">
					{row.weeklyCapacity == null
						? "—"
						: `${number.format(row.weeklyCapacity)} h`}
				</span>
			),
		},
		{
			id: "hours",
			header: "This month",
			label: "Hours this month",
			align: "right",
			width: "w-[10%]",
			cell: (row) => (
				<span className="text-muted-foreground tabular-nums">
					{number.format(payroll.get(row.id)?.hours ?? 0)} h
				</span>
			),
		},
		{
			id: "cost",
			header: "Cost",
			label: "Estimated cost this month",
			align: "right",
			width: "w-[12%]",
			hideBelow: "sm",
			cell: (row) => (
				<span className="text-muted-foreground tabular-nums">
					{formatMoney(
						Math.round((payroll.get(row.id)?.cost ?? 0) * 100),
						currency,
					)}
				</span>
			),
		},
		{
			id: "startDate",
			header: "Started",
			label: "Start date",
			sortable: true,
			align: "right",
			width: "w-[12%]",
			defaultHidden: true,
			cell: (row) =>
				row.startDate ? <LocalDay date={row.startDate} /> : <EmptyCellValue />,
		},
	];
}

export function TeamTable({
	month,
	canUploadDocuments,
}: {
	month: string;
	canUploadDocuments: boolean;
}) {
	const trpc = useTRPC();
	const { query, input } = useTableQuery(teamSearchParams);
	const [memberId, setMemberId] = useQueryState("member", parseAsString);
	const members = useQuery({
		...trpc.engagements.teamMembers.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const payroll = useQuery(trpc.workManagement.payroll.queryOptions({ month }));
	const currency = useQuery(trpc.currency.settings.queryOptions());
	const payrollByMember = useMemo(
		() =>
			new Map(
				(payroll.data ?? []).map((row) => [
					row.teamMember.id,
					{ hours: row.hours, cost: row.cost },
				]),
			),
		[payroll.data],
	);
	const facetCounts = members.data?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: Object.entries(STATUS_LABEL).flatMap(([value, label]) =>
				(facetCounts?.status?.[value] ?? 0) > 0 ? [{ value, label }] : [],
			),
		},
		{
			id: "employmentType",
			label: "Employment type",
			options: Object.entries(EMPLOYMENT_LABEL).flatMap(([value, label]) =>
				(facetCounts?.employmentType?.[value] ?? 0) > 0
					? [{ value, label }]
					: [],
			),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={<ListSearch placeholder="Search by name, email or role…" />}
				columns={columns(
					payrollByMember,
					currency.data?.reportingCurrency ?? "USD",
				)}
				rows={members.data?.rows ?? []}
				total={members.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={members.isFetching || payroll.isFetching}
				onRowClick={(row) => setMemberId(row.id)}
				empty="Nobody matches this view."
			/>
			<TeamMemberSheet
				key={memberId ?? "closed"}
				memberId={memberId}
				month={month}
				canUploadDocuments={canUploadDocuments}
				onOpenChange={(open) => {
					if (!open) void setMemberId(null);
				}}
			/>
		</>
	);
}
