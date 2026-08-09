"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

type Member = { id: string; name: string };

export function TeamDocuments({ members }: { members: Member[] }) {
	const trpc = useTRPC();
	const [teamMemberId, setTeamMemberId] = useState(members[0]?.id ?? "");
	const [label, setLabel] = useState("");
	const [kind, setKind] = useState("student_card");
	const [expiresAt, setExpiresAt] = useState("");
	const [reminderDays, setReminderDays] = useState("30");
	const create = useMutation(
		trpc.workManagement.createDocument.mutationOptions({
			onSuccess: () => {
				setLabel("");
				setExpiresAt("");
			},
		}),
	);

	function submit() {
		if (!teamMemberId || !label.trim()) return;
		create.mutate({
			teamMemberId,
			kind,
			label,
			expiresAt: expiresAt
				? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
				: null,
			reminderDays: Number(reminderDays) || 0,
		});
	}

	return (
		<div className="grid gap-3 md:grid-cols-[180px_150px_1fr_180px_100px_auto]">
			<select
				value={teamMemberId}
				onChange={(event) => setTeamMemberId(event.target.value)}
				className="h-10 rounded-md border bg-background px-3 text-sm"
			>
				{members.map((member) => (
					<option key={member.id} value={member.id}>
						{member.name}
					</option>
				))}
			</select>
			<Input value={kind} onChange={(event) => setKind(event.target.value)} />
			<Input
				value={label}
				onChange={(event) => setLabel(event.target.value)}
				placeholder="Document label"
			/>
			<Input
				type="date"
				value={expiresAt}
				onChange={(event) => setExpiresAt(event.target.value)}
			/>
			<Input
				type="number"
				min={0}
				value={reminderDays}
				onChange={(event) => setReminderDays(event.target.value)}
				aria-label="Reminder days"
			/>
			<Button type="button" onClick={submit} disabled={create.isPending}>
				Add
			</Button>
		</div>
	);
}
