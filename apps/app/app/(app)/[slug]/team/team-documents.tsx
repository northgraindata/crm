"use client";

import Add from "@carbon/icons-react/es/Add";
import Document from "@carbon/icons-react/es/Document";
import Upload from "@carbon/icons-react/es/Upload";
import View from "@carbon/icons-react/es/View";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
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
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DetailSheetEmpty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalDay } from "@/components/local-date-time";
import { TEAM_DOCUMENT_ACCEPT } from "@/lib/team-document-upload";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { uploadTeamDocumentFile } from "./actions";

const DOCUMENT_COLUMNS: SimpleTableColumn[] = [
	{ id: "document", header: "Document", width: "w-[38%]" },
	{ id: "type", header: "Type", width: "w-[20%]" },
	{ id: "expiry", header: "Expires", width: "w-[18%]" },
	{ id: "status", header: "Status", width: "w-[12%]", align: "right" },
	{ id: "file", header: "", srLabel: "File", width: "w-[12%]" },
];

const DOCUMENT_KINDS = {
	contract: "Contract",
	nda: "NDA",
	id_document: "ID document",
	student_card: "Student card",
	other: "Other",
} as const;

export function TeamDocuments({
	memberId,
	canUpload,
}: {
	memberId: string;
	canUpload: boolean;
}) {
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
						canUpload={canUpload}
						onDone={() => setAdding(false)}
					/>
				) : null}
			</DetailSheetSection>

			{documents.data?.length ? (
				<SimpleTable variant="panel" columns={DOCUMENT_COLUMNS}>
					{documents.data.map((document) => (
						<SimpleTableRow key={document.id}>
							<TableCell className="py-2.5 pl-5 font-medium">
								<span className="block">{document.label}</span>
								{document.fileName ? (
									<span className="block truncate font-normal text-muted-foreground text-xs">
										{document.fileName}
									</span>
								) : null}
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
							<TableCell className="pr-5 text-right">
								<DocumentFileAction
									documentId={document.id}
									memberId={memberId}
									fileUrl={document.fileUrl}
									canUpload={canUpload}
								/>
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			) : adding || documents.isLoading ? null : (
				<DetailSheetEmpty
					icon={Document}
					title="No documents yet"
					description="Contracts, IDs and other employee documents will appear here."
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

function DocumentFileAction({
	documentId,
	memberId,
	fileUrl,
	canUpload,
}: {
	documentId: string;
	memberId: string;
	fileUrl: string | null;
	canUpload: boolean;
}) {
	const cache = useCrmCache();
	const input = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	if (fileUrl) {
		return (
			<Button variant="ghost" size="sm" asChild>
				<a href={fileUrl} target="_blank" rel="noreferrer">
					<Icon icon={View} data-icon="inline-start" />
					Open
				</a>
			</Button>
		);
	}

	if (!canUpload) return <span className="text-muted-foreground">—</span>;

	return (
		<>
			<Input
				ref={input}
				className="sr-only"
				type="file"
				accept={TEAM_DOCUMENT_ACCEPT}
				aria-label="Upload document file"
				onChange={async (event) => {
					const file = event.currentTarget.files?.[0];
					if (!file) return;
					const formData = new FormData();
					formData.set("file", file);
					setUploading(true);
					try {
						const result = await uploadTeamDocumentFile(documentId, formData);
						if (result.ok) {
							await cache.team(memberId);
							toast.success("File uploaded.");
						} else {
							toast.error(result.error);
						}
					} catch {
						toast.error("The file could not be uploaded.");
					} finally {
						setUploading(false);
						if (input.current) input.current.value = "";
					}
				}}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={uploading}
				onClick={() => input.current?.click()}
			>
				{uploading ? (
					<Spinner data-icon="inline-start" />
				) : (
					<Icon icon={Upload} data-icon="inline-start" />
				)}
				Upload
			</Button>
		</>
	);
}

function DocumentForm({
	memberId,
	canUpload,
	onDone,
}: {
	memberId: string;
	canUpload: boolean;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [kind, setKind] = useState<keyof typeof DOCUMENT_KINDS>("contract");
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [reminderDays, setReminderDays] = useState("30");
	const [submitting, setSubmitting] = useState(false);
	const kindId = useId();
	const labelId = useId();
	const expiresAtId = useId();
	const reminderDaysId = useId();
	const fileId = useId();
	const create = useMutation(
		trpc.workManagement.createDocument.mutationOptions(),
	);

	return (
		<form
			className="flex flex-col gap-4 rounded-lg border p-4"
			onSubmit={async (event) => {
				event.preventDefault();
				const formData = new FormData(event.currentTarget);
				const file = formData.get("file");
				setSubmitting(true);
				try {
					const document = await create.mutateAsync({
						teamMemberId: memberId,
						kind,
						label,
						expiresAt: expiresAt
							? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
							: null,
						reminderDays: Number(reminderDays) || 0,
					});

					const hasFile = file instanceof File && file.size > 0;
					const upload =
						canUpload && hasFile
							? await uploadTeamDocumentFile(document.id, formData)
							: null;

					await cache.team(memberId);
					if (upload && !upload.ok) {
						toast.warning(`Document added without the file. ${upload.error}`);
					} else {
						toast.success("Document added.");
					}
					onDone();
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : "Document failed.",
					);
				} finally {
					setSubmitting(false);
				}
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
					<FieldLabel htmlFor={expiresAtId}>Expiry date (optional)</FieldLabel>
					<Input
						id={expiresAtId}
						name="expiresAt"
						type="date"
						value={expiresAt}
						onChange={(event) => setExpiresAt(event.target.value)}
					/>
				</Field>
				{expiresAt ? (
					<Field>
						<FieldLabel htmlFor={reminderDaysId}>
							Remind before expiry
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id={reminderDaysId}
								name="reminderDays"
								type="number"
								inputMode="numeric"
								min={0}
								max={365}
								value={reminderDays}
								onChange={(event) => setReminderDays(event.target.value)}
							/>
							<InputGroupAddon align="inline-end">days</InputGroupAddon>
						</InputGroup>
					</Field>
				) : null}
				{canUpload ? (
					<Field>
						<FieldLabel htmlFor={fileId}>File (optional)</FieldLabel>
						<Input
							id={fileId}
							name="file"
							type="file"
							accept={TEAM_DOCUMENT_ACCEPT}
						/>
						<FieldDescription>
							PDF, JPEG, PNG, WebP or HEIC, up to 10 MB.
						</FieldDescription>
					</Field>
				) : null}
			</FieldGroup>
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button type="submit" disabled={submitting}>
					{submitting ? <Spinner /> : null}
					Add document
				</Button>
			</div>
		</form>
	);
}
