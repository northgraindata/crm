"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import type { ReactNode } from "react";
import { LocalRelativeTime } from "@/components/local-date-time";

export type ProviderSource = {
	id: string;
	source: string;
	mailboxAddress: string | null;
	displayName: string | null;
	connected: boolean;
	status: string | null;
	lastSyncedAt: string | null;
	lastError: string | null;
	autoCreate: boolean;
};

export type ProviderConnection = {
	id: string;
	hasRefreshToken: boolean;
	sources: ProviderSource[];
};

type Props = {
	name: string;
	description: string;
	configured: boolean;
	connections: ProviderConnection[];
	connectError?: string;
	logo?: ReactNode;
	connecting: boolean;
	syncing: boolean;
	disconnecting: boolean;
	changingAutoCreate: boolean;
	purging?: boolean;
	manageUrl?: string;
	onConnect(): void;
	onSync(): void;
	onDisconnect(connectionId: string): void;
	onAutoCreate(syncId: string, enabled: boolean): void;
	onPurge?(connectionId: string): void;
	sourceLabel(source: string): string;
	autoCreateCopy(source: string): string;
};

export function ProviderConnections({
	name,
	description,
	configured,
	connections,
	connectError,
	logo,
	connecting,
	syncing,
	disconnecting,
	changingAutoCreate,
	purging,
	manageUrl,
	onConnect,
	onSync,
	onDisconnect,
	onAutoCreate,
	onPurge,
	sourceLabel,
	autoCreateCopy,
}: Props) {
	if (!configured) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{name}
						<StatusIndicator size="sm" tone="neutral" label="Not configured" />
					</CardTitle>
					<CardDescription>
						Add the {name} OAuth credentials to the root .env file and restart.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{name}
					<StatusIndicator
						size="sm"
						tone={connections.length > 0 ? "success" : "neutral"}
						label={
							connections.length === 1
								? "1 account"
								: `${connections.length} accounts`
						}
					/>
				</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					{connections.length > 0 ? (
						<Button
							variant="contrast"
							size="sm"
							disabled={syncing}
							onClick={onSync}
						>
							{syncing ? "Checking…" : "Check now"}
						</Button>
					) : null}
					<Button size="sm" disabled={connecting} onClick={onConnect}>
						{connecting ? <Spinner data-icon="inline-start" /> : logo}
						Add account
					</Button>
				</CardAction>
			</CardHeader>

			{connectError ? (
				<Alert variant="destructive">
					<Icon icon={Warning} />
					<AlertTitle>{name} did not finish connecting</AlertTitle>
					<AlertDescription>
						The provider returned an error before the account was connected. Try
						again.
					</AlertDescription>
				</Alert>
			) : null}

			{connections.length === 0 ? (
				<CardContent>
					<p className="text-muted-foreground text-xs">
						No {name} accounts connected yet.
					</p>
				</CardContent>
			) : (
				connections.map((connection, index) => (
					<Connection
						key={connection.id}
						name={name}
						connection={connection}
						index={index}
						disconnecting={disconnecting}
						changingAutoCreate={changingAutoCreate}
						purging={purging}
						manageUrl={manageUrl}
						onDisconnect={onDisconnect}
						onAutoCreate={onAutoCreate}
						onPurge={onPurge}
						sourceLabel={sourceLabel}
						autoCreateCopy={autoCreateCopy}
					/>
				))
			)}
		</Card>
	);
}

function Connection({
	name,
	connection,
	index,
	disconnecting,
	changingAutoCreate,
	purging,
	manageUrl,
	onDisconnect,
	onAutoCreate,
	onPurge,
	sourceLabel,
	autoCreateCopy,
}: Omit<
	Props,
	| "configured"
	| "connections"
	| "description"
	| "connectError"
	| "logo"
	| "connecting"
	| "syncing"
	| "onConnect"
	| "onSync"
> & {
	connection: ProviderConnection;
	index: number;
}) {
	const failing = connection.sources.filter(
		(source) => source.status === "NEEDS_RECONNECT" || source.lastError,
	);
	const identity = connection.sources.find((source) => source.mailboxAddress);
	const lastSyncedAt = connection.sources
		.map((source) => source.lastSyncedAt)
		.filter((value): value is string => value !== null)
		.sort()
		.at(-1);
	const healthy = connection.hasRefreshToken && failing.length === 0;

	return (
		<CardContent>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">
						{identity?.displayName ||
							identity?.mailboxAddress ||
							`${name} account ${index + 1}`}
					</p>
					{identity?.displayName && identity.mailboxAddress ? (
						<p className="truncate text-muted-foreground text-xs">
							{identity.mailboxAddress}
						</p>
					) : null}
				</div>
				<StatusIndicator
					size="sm"
					tone={healthy ? "success" : "warning"}
					label={healthy ? "Connected" : "Needs attention"}
				/>
			</div>

			{!connection.hasRefreshToken ? (
				<Alert variant="destructive">
					<Icon icon={Warning} />
					<AlertTitle>Reconnect this account</AlertTitle>
					<AlertDescription>
						{name} did not return a refresh token, so background sync cannot
						run.
					</AlertDescription>
				</Alert>
			) : null}

			{failing.map((source) => (
				<Alert key={source.id} variant="destructive">
					<Icon icon={Warning} />
					<AlertTitle>{sourceLabel(source.source)} sync failed</AlertTitle>
					<AlertDescription>
						{source.lastError ?? `${name} needs reconnecting.`}
					</AlertDescription>
				</Alert>
			))}

			{failing.length === 0 && connection.hasRefreshToken ? (
				<p className="text-muted-foreground text-xs">
					{lastSyncedAt ? (
						<>
							Last checked <LocalRelativeTime date={lastSyncedAt} />
						</>
					) : (
						"Waiting for the first check"
					)}
				</p>
			) : null}

			{connection.sources.map((source) => (
				<div
					key={source.id}
					className="flex items-center justify-between gap-6"
				>
					<Label
						htmlFor={`auto-create-${source.id}`}
						className="flex min-w-0 flex-col items-start gap-1"
					>
						<span className="truncate text-sm">
							{source.mailboxAddress ?? sourceLabel(source.source)}
						</span>
						<span className="font-normal text-muted-foreground text-xs">
							{sourceLabel(source.source)} · {autoCreateCopy(source.source)}
						</span>
					</Label>
					<Switch
						id={`auto-create-${source.id}`}
						checked={source.autoCreate}
						disabled={changingAutoCreate}
						onCheckedChange={(enabled) => onAutoCreate(source.id, enabled)}
					/>
				</div>
			))}

			<CardFooter>
				<div className="-ml-2 flex flex-wrap items-center gap-1">
					{onPurge ? (
						<Confirmation
							trigger="Delete synced data"
							title={`Delete data from this ${name} account?`}
							description="Synced email and calendar data from this account is removed. Other connected accounts are not affected."
							disabled={purging}
							onConfirm={() => onPurge(connection.id)}
						/>
					) : null}
					<Confirmation
						trigger="Disconnect"
						title={`Disconnect this ${name} account?`}
						description="New data stops arriving from this account. Already synced CRM data stays unless you delete it separately."
						disabled={disconnecting}
						onConfirm={() => onDisconnect(connection.id)}
					/>
					{manageUrl ? (
						<Button variant="ghost" size="xs" asChild>
							<a href={manageUrl} target="_blank" rel="noreferrer">
								Manage provider access
							</a>
						</Button>
					) : null}
				</div>
			</CardFooter>
		</CardContent>
	);
}

function Confirmation({
	trigger,
	title,
	description,
	disabled,
	onConfirm,
}: {
	trigger: string;
	title: string;
	description: string;
	disabled?: boolean;
	onConfirm(): void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="xs" disabled={disabled}>
					{trigger}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						{trigger}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
