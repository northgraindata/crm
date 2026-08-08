"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

type Mode = "sign-in" | "create";

export function CredentialsSignIn() {
	const [mode, setMode] = useState<Mode>("sign-in");
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		const origin = window.location.origin;

		const result =
			mode === "create"
				? await authClient.signUp.email({
						email,
						password,
						name: String(data.get("name") ?? "").trim(),
						callbackURL: `${origin}/`,
					})
				: await authClient.signIn.email({
						email,
						password,
						callbackURL: `${origin}/`,
					});

		if (result.error) {
			setPending(false);
			toast.error(result.error.message ?? "Could not sign in.");
			return;
		}

		window.location.assign("/");
	}

	return (
		<Tabs
			value={mode}
			onValueChange={(value) => setMode(value as Mode)}
			className="w-full"
		>
			<TabsList className="w-full">
				<TabsTrigger value="sign-in">Sign in</TabsTrigger>
				<TabsTrigger value="create">Create account</TabsTrigger>
			</TabsList>

			<TabsContent value={mode}>
				<form onSubmit={submit}>
					<FieldGroup>
						{mode === "create" ? (
							<Field>
								<FieldLabel htmlFor="name">Name</FieldLabel>
								<Input id="name" name="name" autoComplete="name" required />
							</Field>
						) : null}

						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete={
									mode === "create" ? "new-password" : "current-password"
								}
								minLength={8}
								required
							/>
						</Field>

						<Field>
							<Button className="w-full" type="submit" disabled={pending}>
								{pending ? <Spinner data-icon="inline-start" /> : null}
								{mode === "create" ? "Create account" : "Sign in"}
							</Button>
						</Field>
					</FieldGroup>
				</form>
			</TabsContent>
		</Tabs>
	);
}
