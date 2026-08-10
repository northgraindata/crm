"use client";

import Add from "@carbon/icons-react/es/Add";
import Document from "@carbon/icons-react/es/Document";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	DetailSheetEmpty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalDay } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const DOCUMENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "document", header: "Document", width: "w-[46%]" },
	{ id: "type", header: "Type", width: "w-[22%]" },
	{ id: "expiry", header: "Expires", width: "w-[20%]" },
	{ id: "status", header: "Status", width: "w-[12%]", align: "right" },
];

const DOCUMENT_KINDS = {
	contract: "Contract",
	nda: "NDA",
	id_document: "ID document",
	student_card: "Student card",
	other: "Other",
} as const;

export function TeamDocuments({ memberId }: { memberId: string }) {
	const trpc = useTRPC();
	const [adding, setAdding] = useState(false);
	const documents = useQuery(
		trpc.workManagement.documents.queryOptions({ teamMemberId: memberId }),
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<DetailSheetSection
				title="Documents"
				action={
					adding ? null : (
						<Button variant="outline" size="sm" onClick={() => setAdding(true)}>
							<Icon icon={Add} data-icon="inline-start" />
							Add document
						</Button>
					)
				}
			>
				{adding ? (
					<DocumentForm
						key="new-document"
						memberId={memberId}
						onDone={() => setAdding(false)}
					/>
				) : null}
			</DetailSheetSection>

			{documents.data?.length ? (
				<SimpleTable variant="panel" columns={DOCUMENT_COLUMNS}>
					{documents.data.map((document) => (
						<SimpleTableRow key={document.id}>
							<TableCell className="py-2.5 pl-5 font-medium">
								{document.label}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{DOCUMENT_KINDS[document.kind as keyof typeof DOCUMENT_KINDS] ??
									document.kind}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{document.expiresAt ? (
									<LocalDay date={document.expiresAt} />
								) : (
									"—"
								)}
							</TableCell>
							<TableCell className="pr-5 text-right text-muted-foreground">
								{document.status.toLowerCase()}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			) : adding || documents.isLoading ? null : (
				<DetailSheetEmpty
					icon={Document}
					title="No documents yet"
					description="Contracts, IDs and other expiring documents will appear here."
					action={
						<Button variant="outline" size="sm" onClick={() => setAdding(true)}>
							<Icon icon={Add} data-icon="inline-start" />
							Add document
						</Button>
					}
				/>
			)}
		</div>
	);
}

function DocumentForm({
	memberId,
	onDone,
}: {
	memberId: string;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [kind, setKind] = useState<keyof typeof DOCUMENT_KINDS>("contract");
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [reminderDays, setReminderDays] = useState("30");
	const kindId = useId();
	const labelId = useId();
	const expiresAtId = useId();
	const reminderDaysId = useId();
	const create = useMutation(
		trpc.workManagement.createDocument.mutationOptions({
			onSuccess: async () => {
				await cache.team(memberId);
				toast.success("Document added.");
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			className="flex flex-col gap-4 rounded-lg border p-4"
			onSubmit={(event) => {
				event.preventDefault();
				create.mutate({
					teamMemberId: memberId,
					kind,
					label,
					expiresAt: expiresAt
						? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
						: null,
					reminderDays: Number(reminderDays) || 0,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={kindId}>Type</FieldLabel>
					<Select
						value={kind}
						onValueChange={(value) =>
							setKind(value as keyof typeof DOCUMENT_KINDS)
						}
					>
						<SelectTrigger id={kindId}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{Object.entries(DOCUMENT_KINDS).map(([value, name]) => (
									<SelectItem key={value} value={value}>
										{name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor={labelId}>Label</FieldLabel>
					<Input
						id={labelId}
						name="label"
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						placeholder="Employment contract"
						autoComplete="off"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={expiresAtId}>Expiry date</FieldLabel>
					<Input
						id={expiresAtId}
						name="expiresAt"
						type="date"
						value={expiresAt}
						onChange={(event) => setExpiresAt(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={reminderDaysId}>Remind before</FieldLabel>
					<Input
						id={reminderDaysId}
						name="reminderDays"
						type="number"
						inputMode="numeric"
						min={0}
						max={365}
						value={reminderDays}
						onChange={(event) => setReminderDays(event.target.value)}
					/>
				</Field>
			</FieldGroup>
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button type="submit" disabled={create.isPending}>
					{create.isPending ? <Spinner /> : null}
					Add document
				</Button>
			</div>
		</form>
	);
}
