"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

const COLUMNS = [
	["BACKLOG", "Backlog"],
	["TODO", "Todo"],
	["IN_PROGRESS", "In progress"],
	["BLOCKED", "Blocked"],
	["REVIEW", "Review"],
	["DONE", "Done"],
] as const;

export function WorkTaskBoard({ engagementId }: { engagementId: string }) {
	const trpc = useTRPC();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [assigneeId, setAssigneeId] = useState("");
	const [manualMemberId, setManualMemberId] = useState("");
	const [manualMinutes, setManualMinutes] = useState("60");
	const [manualNote, setManualNote] = useState("");
	const tasks = useQuery(
		trpc.workManagement.tasks.queryOptions({ engagementId }),
	);
	const teamMembers = useQuery(trpc.engagements.teamMembers.queryOptions({}));
	const entries = useQuery(
		trpc.workManagement.timeEntries.queryOptions({ engagementId }),
	);
	const invalidate = {
		onSuccess: () => {
			tasks.refetch();
			entries.refetch();
		},
	};
	const create = useMutation(
		trpc.workManagement.createTask.mutationOptions(invalidate),
	);
	const move = useMutation(
		trpc.workManagement.moveTask.mutationOptions(invalidate),
	);
	const start = useMutation(
		trpc.workManagement.startTimer.mutationOptions(invalidate),
	);
	const stop = useMutation(
		trpc.workManagement.stopTimer.mutationOptions(invalidate),
	);
	const manual = useMutation(
		trpc.workManagement.createTimeEntry.mutationOptions(invalidate),
	);

	function addTask() {
		if (!title.trim()) return;
		create.mutate({
			engagementId,
			title,
			description: description || null,
			assigneeId: assigneeId || null,
			status: "TODO",
			priority: "MEDIUM",
			sortOrder: 0,
		});
		setTitle("");
		setDescription("");
		setAssigneeId("");
	}

	function addManualEntry() {
		if (!manualMemberId || Number(manualMinutes) <= 0) return;
		manual.mutate({
			teamMemberId: manualMemberId,
			engagementId,
			workDate: new Date().toISOString(),
			durationMinutes: Number(manualMinutes),
			billable: true,
			note: manualNote || null,
		});
		setManualNote("");
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid gap-2 md:grid-cols-[1fr_2fr_200px_auto]">
				<Input
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="New work task"
				/>
				<Textarea
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Optional task context"
					rows={1}
				/>
				<select
					value={assigneeId}
					onChange={(event) => setAssigneeId(event.target.value)}
					className="h-10 rounded-md border bg-background px-3 text-sm"
				>
					<option value="">Assign later</option>
					{(teamMembers.data ?? []).map((member) => (
						<option key={member.id} value={member.id}>
							{member.name}
						</option>
					))}
				</select>
				<Button type="button" onClick={addTask} disabled={create.isPending}>
					Add task
				</Button>
			</div>
			<div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[200px_120px_1fr_auto]">
				<select
					value={manualMemberId}
					onChange={(event) => setManualMemberId(event.target.value)}
					className="h-10 rounded-md border bg-background px-3 text-sm"
				>
					<option value="">Log time for...</option>
					{(teamMembers.data ?? []).map((member) => (
						<option key={member.id} value={member.id}>
							{member.name}
						</option>
					))}
				</select>
				<Input
					type="number"
					min={1}
					value={manualMinutes}
					onChange={(event) => setManualMinutes(event.target.value)}
					aria-label="Minutes"
				/>
				<Input
					value={manualNote}
					onChange={(event) => setManualNote(event.target.value)}
					placeholder="Time entry note"
				/>
				<Button
					type="button"
					onClick={addManualEntry}
					disabled={manual.isPending}
				>
					Log time
				</Button>
			</div>
			<div className="grid gap-3 overflow-x-auto xl:grid-cols-6">
				{COLUMNS.map(([status, label]) => {
					const column = (tasks.data ?? []).filter(
						(task) => task.status === status,
					);
					return (
						<div
							key={status}
							className="min-w-[220px] rounded-lg border bg-muted/30 p-3"
						>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-sm font-medium">{label}</h2>
								<span className="text-muted-foreground text-xs">
									{column.length}
								</span>
							</div>
							<div className="flex flex-col gap-2">
								{column.map((task) => {
									const active = (entries.data ?? []).find(
										(entry) =>
											entry.workTaskId === task.id &&
											entry.startedAt &&
											!entry.endedAt,
									);
									return (
										<div
											key={task.id}
											className="rounded-md border bg-background p-3"
										>
											<p className="text-sm font-medium">{task.title}</p>
											{task.description ? (
												<p className="mt-1 text-muted-foreground text-xs">
													{task.description}
												</p>
											) : null}
											<div className="mt-3 flex flex-wrap gap-1">
												{COLUMNS.map(
													([nextStatus, nextLabel]) =>
														nextStatus !== status && (
															<Button
																key={nextStatus}
																type="button"
																variant="outline"
																size="sm"
																onClick={() =>
																	move.mutate({
																		id: task.id,
																		status: nextStatus,
																		sortOrder: 0,
																	})
																}
															>
																{nextLabel}
															</Button>
														),
												)}
											</div>
											{active ? (
												<Button
													className="mt-2 w-full"
													type="button"
													variant="secondary"
													onClick={() => stop.mutate({ id: active.id })}
												>
													Stop timer
												</Button>
											) : (
												<Button
													className="mt-2 w-full"
													type="button"
													variant="outline"
													onClick={() =>
														start.mutate({
															engagementId,
															workTaskId: task.id,
															teamMemberId: task.assigneeId ?? "",
														})
													}
													disabled={!task.assigneeId}
												>
													Start timer
												</Button>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
			<p className="text-muted-foreground text-xs">
				Time entries:{" "}
				{(entries.data ?? [])
					.filter((entry) => entry.durationMinutes)
					.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0)}{" "}
				minutes. Assign a team member to start a timer.
			</p>
		</div>
	);
}
