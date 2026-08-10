"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { type ComponentProps, Suspense } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { TeamMemberForm } from "./team-member-form";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			New team member
		</Button>
	);
}

export function CreateTeamMemberSheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateTeamMemberForm />
		</Suspense>
	);
}

function CreateTeamMemberForm() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useQueryState(
		"new-team-member",
		parseAsBoolean.withDefault(false),
	);
	const [, setMemberId] = useQueryState("member", parseAsString);
	const create = useMutation(
		trpc.engagements.createTeamMember.mutationOptions({
			onSuccess: async (member) => {
				await cache.team(member.id);
				toast.success(`${member.name} added.`);
				await setOpen(null);
				await setMemberId(member.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New team member</SheetTitle>
					<SheetDescription>
						Add their role, availability and cost details.
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4">
					<TeamMemberForm
						key={String(open)}
						formId="create-team-member"
						onSubmit={(value) => create.mutate(value)}
					/>
				</div>
				<SheetFooter>
					<Button
						type="submit"
						form="create-team-member"
						disabled={create.isPending}
					>
						{create.isPending ? <Spinner /> : null}
						Add team member
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
