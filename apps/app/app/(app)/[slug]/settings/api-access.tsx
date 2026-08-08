"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const READ_SCOPE = "crm:read" as const;
const WRITE_SCOPE = "crm:write" as const;

export function ApiAccess() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<("crm:read" | "crm:write")[]>([
		READ_SCOPE,
	]);
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const tokens = useQuery(trpc.apiAccess.tokens.queryOptions());
	const create = useMutation(
		trpc.apiAccess.createToken.mutationOptions({
			onSuccess: (result) => {
				setCreatedToken(result.token);
				setName("");
				void queryClient.invalidateQueries({
					queryKey: trpc.apiAccess.tokens.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revoke = useMutation(
		trpc.apiAccess.revokeToken.mutationOptions({
			onSuccess: () =>
				void queryClient.invalidateQueries({
					queryKey: trpc.apiAccess.tokens.queryKey(),
				}),
			onError: (error) => toast.error(error.message),
		}),
	);

	function toggle(scope: "crm:read" | "crm:write") {
		setScopes((current) =>
			current.includes(scope)
				? current.filter((value) => value !== scope)
				: [...current, scope],
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>API access</CardTitle>
				<CardDescription>
					Create tokens for external apps and automations. Tokens are shown once
					and can be revoked at any time.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{createdToken ? (
					<div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
						<p className="font-medium text-sm">Copy this token now</p>
						<p className="text-muted-foreground text-xs">
							It will not be shown again.
						</p>
						<div className="flex gap-2">
							<Input readOnly value={createdToken} aria-label="New API token" />
							<Button
								type="button"
								onClick={() => {
									navigator.clipboard
										.writeText(createdToken)
										.then(() => toast.success("Token copied."))
										.catch(() => toast.error("Could not copy the token."));
								}}
							>
								Copy
							</Button>
						</div>
					</div>
				) : null}

				<form
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({ name, scopes });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="api-token-name">Token name</FieldLabel>
							<Input
								id="api-token-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Zapier, website, local script"
								required
							/>
						</Field>
						<Field>
							<FieldLabel>Scopes</FieldLabel>
							<div className="flex items-start gap-3 text-sm">
								<Checkbox
									id="api-scope-read"
									checked={scopes.includes(READ_SCOPE)}
									onCheckedChange={() => toggle(READ_SCOPE)}
								/>
								<label htmlFor="api-scope-read">
									<span className="block">Read CRM data</span>
									<span className="block text-muted-foreground text-xs">
										List and view companies, contacts, and deals.
									</span>
								</label>
							</div>
							<div className="flex items-start gap-3 text-sm">
								<Checkbox
									id="api-scope-write"
									checked={scopes.includes(WRITE_SCOPE)}
									onCheckedChange={() => toggle(WRITE_SCOPE)}
								/>
								<label htmlFor="api-scope-write">
									<span className="block">Write CRM data</span>
									<span className="block text-muted-foreground text-xs">
										Create, update, and delete companies, contacts, and deals.
									</span>
								</label>
							</div>
						</Field>
						<Field>
							<Button
								type="submit"
								disabled={create.isPending || scopes.length === 0}
							>
								{create.isPending ? <Spinner data-icon="inline-start" /> : null}
								Create token
							</Button>
						</Field>
					</FieldGroup>
				</form>

				{tokens.data?.length ? (
					<div className="flex flex-col gap-2 border-t pt-4">
						<p className="font-medium text-sm">Active tokens</p>
						{tokens.data.map((token) => (
							<div
								key={token.id}
								className="flex items-center justify-between gap-4 rounded-md border p-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm">{token.name}</p>
									<p className="text-muted-foreground text-xs">
										{token.tokenPrefix}… · {token.scopes.join(", ")}
									</p>
								</div>
								<Button
									variant="ghost"
									size="xs"
									disabled={revoke.isPending}
									onClick={() => revoke.mutate({ id: token.id })}
								>
									Revoke
								</Button>
							</div>
						))}
					</div>
				) : null}
			</CardContent>
			<CardFooter>
				<p className="text-muted-foreground text-xs">
					Use <code>Authorization: Bearer &lt;token&gt;</code> with the external
					API.
				</p>
			</CardFooter>
		</Card>
	);
}
