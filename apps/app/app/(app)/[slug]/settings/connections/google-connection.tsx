"use client";

import { authClient } from "@crm/auth/client";
import { SYNC_SCOPES } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ProviderConnections } from "./provider-connections";

export function GoogleConnection({ connectError }: { connectError?: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [connecting, setConnecting] = useState(false);
	const status = useQuery({
		...trpc.google.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.connections.some((connection) =>
				connection.sources.some((source) => isSyncing(source.status)),
			)
				? SYNC_POLL_MS
				: false,
	});
	const sync = useMutation(
		trpc.google.syncNow.mutationOptions({
			onSuccess: () => cache.google(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnect = useMutation(
		trpc.google.revokeAccess.mutationOptions({
			onSuccess: () => cache.google(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const purge = useMutation(
		trpc.google.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.google();
				toast.success(`Removed ${result.purged} synced items.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const autoCreate = useMutation(
		trpc.google.setAutoCreate.mutationOptions({
			onSuccess: () => cache.google({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	async function connect() {
		setConnecting(true);
		const origin = window.location.origin;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES],
			callbackURL: `${origin}/settings/connections`,
			errorCallbackURL: `${origin}/settings/connections?provider=google`,
		});
		if (error) {
			setConnecting(false);
			toast.error(error.message ?? "Could not connect Google.");
		}
	}

	return (
		<ProviderConnections
			name="Google"
			description="Connect any number of Google accounts for read-only Gmail and all calendars on each account."
			configured={status.data.configured}
			connections={status.data.connections}
			connectError={connectError}
			logo={<GoogleLogo data-icon="inline-start" className="size-4" />}
			connecting={connecting}
			syncing={sync.isPending}
			disconnecting={disconnect.isPending}
			changingAutoCreate={autoCreate.isPending}
			purging={purge.isPending}
			manageUrl="https://myaccount.google.com/permissions"
			onConnect={() => void connect()}
			onSync={() => sync.mutate()}
			onDisconnect={(connectionId) => disconnect.mutate({ connectionId })}
			onPurge={(connectionId) => purge.mutate({ connectionId })}
			onAutoCreate={(syncId, enabled) => autoCreate.mutate({ syncId, enabled })}
			sourceLabel={(source) => (source === "calendar" ? "Calendar" : "Gmail")}
			autoCreateCopy={(source) =>
				source === "calendar"
					? "Create contacts from new meetings"
					: "Create contacts from email replies"
			}
		/>
	);
}
