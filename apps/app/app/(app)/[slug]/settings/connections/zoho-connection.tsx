"use client";

import { authClient } from "@crm/auth/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ProviderConnections } from "./provider-connections";

export function ZohoConnection({ connectError }: { connectError?: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [connecting, setConnecting] = useState(false);
	const status = useQuery({
		...trpc.zoho.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.connections.some((connection) =>
				connection.sources.some((source) => isSyncing(source.status)),
			)
				? SYNC_POLL_MS
				: false,
	});
	const sync = useMutation(
		trpc.zoho.syncNow.mutationOptions({
			onSuccess: () => cache.zoho(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnect = useMutation(
		trpc.zoho.revokeAccess.mutationOptions({
			onSuccess: () => cache.zoho(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const autoCreate = useMutation(
		trpc.zoho.setAutoCreate.mutationOptions({
			onSuccess: () => cache.zoho({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!status.data) return null;

	async function connect() {
		setConnecting(true);
		const origin = window.location.origin;
		const { error } = await authClient.oauth2.link({
			providerId: "zoho",
			callbackURL: `${origin}/settings/connections`,
			errorCallbackURL: `${origin}/settings/connections?provider=zoho`,
		});
		if (error) {
			setConnecting(false);
			toast.error(error.message ?? "Could not connect Zoho.");
		}
	}

	return (
		<ProviderConnections
			name="Zoho Mail"
			description="Connect any number of Zoho accounts. Every enabled mailbox in each account can sync read-only email."
			configured={status.data.configured}
			connections={status.data.connections}
			connectError={connectError}
			connecting={connecting}
			syncing={sync.isPending}
			disconnecting={disconnect.isPending}
			changingAutoCreate={autoCreate.isPending}
			onConnect={() => void connect()}
			onSync={() => sync.mutate()}
			onDisconnect={(connectionId) => disconnect.mutate({ connectionId })}
			onAutoCreate={(syncId, enabled) => autoCreate.mutate({ syncId, enabled })}
			sourceLabel={() => "Zoho Mail"}
			autoCreateCopy={() => "Create contacts from email replies"}
		/>
	);
}
