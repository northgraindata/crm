importScripts("shared.js", "config.js");

const api = globalThis.browser ?? globalThis.chrome;
const RETRY_MINUTES = [1, 5, 15, 60];
const EXTRACTION_TIMEOUT_MS = 45_000;
const ALARM_NAME = "northgrain-outbox";
let mutationQueue = Promise.resolve();
let extractionRunning = false;

function call(target, method, ...args) {
	return new Promise((resolve, reject) => {
		target[method](...args, (value) => {
			const error = api.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve(value);
		});
	});
}

async function readState() {
	const stored = await call(api.storage.local, "get", [Northgrain.queueKey]);
	return stored[Northgrain.queueKey] ?? { items: [], paused: false };
}

async function writeState(state) {
	await call(api.storage.local, "set", { [Northgrain.queueKey]: state });
	await broadcast(state);
	return state;
}

async function updateState(change) {
	const operation = mutationQueue.then(async () => {
		const state = await readState();
		const next = await change(state);
		return writeState(next ?? state);
	});
	mutationQueue = operation.catch(() => undefined);
	return operation;
}

async function broadcast(state) {
	let tabs = [];
	try {
		tabs = await call(api.tabs, "query", { url: ["https://*.linkedin.com/*"] });
	} catch {
		return;
	}
	await Promise.all(
		tabs.map((tab) =>
			tab.id
				? call(api.tabs, "sendMessage", tab.id, {
						type: "northgrain:queue-state",
						queue: state,
					}).catch(() => undefined)
				: undefined,
		),
	);
}

async function add(details, enrich) {
	const profileUrl = Northgrain.canonicalProfileUrl(details.profileUrl);
	if (!profileUrl || !details.firstName) {
		throw new Error("Unable to identify this LinkedIn profile.");
	}
	let added;
	await updateState((state) => {
		const existing = state.items.find(
			(item) => item.details.profileUrl === profileUrl,
		);
		if (existing) {
			added = existing;
			const companyUrl = Northgrain.canonicalCompanyUrl(
				details.companyLinkedInUrl || existing.details.companyLinkedInUrl,
			);
			if (
				!["extracting", "pending"].includes(existing.status) &&
				(enrich || companyUrl)
			) {
				if (enrich) {
					delete existing.details.companyWebsite;
					delete existing.details.companyDomain;
					delete existing.details.companyWebsiteSource;
				}
				existing.details = { ...existing.details, ...details, profileUrl };
				existing.status = "queued";
				existing.extractionStage = enrich ? "profile" : "company";
				delete existing.warning;
			} else if (["later", "blocked"].includes(existing.status)) {
				existing.status = "ready";
			}
			return state;
		}
		const companyUrl = Northgrain.canonicalCompanyUrl(
			details.companyLinkedInUrl,
		);
		const extractionStage = enrich ? "profile" : companyUrl ? "company" : null;
		added = {
			id: crypto.randomUUID(),
			status: extractionStage ? "queued" : "ready",
			extractionStage: extractionStage ?? undefined,
			details: { ...details, profileUrl },
			createdAt: new Date().toISOString(),
			attempts: 0,
		};
		state.items.push(added);
		return state;
	});
	void processExtractionQueue();
	return added;
}

async function upgradeIncompleteDrafts() {
	await updateState((state) => {
		if (state.websiteAboutOnlyUpgrade4Applied) return state;
		for (const item of state.items) {
			if (!["ready", "later"].includes(item.status)) continue;
			delete item.details.companyWebsite;
			delete item.details.companyDomain;
			delete item.details.companyWebsiteSource;
			delete item.details.companyLinkedInUrl;
			item.status = "queued";
			item.extractionStage = "profile";
			delete item.warning;
		}
		state.enrichmentUpgrade2Applied = true;
		state.companyResolutionUpgrade3Applied = true;
		state.websiteAboutOnlyUpgrade4Applied = true;
		return state;
	});
}

async function processExtractionQueue() {
	if (extractionRunning) return;
	extractionRunning = true;
	try {
		const state = await readState();
		if (state.items.some((item) => item.status === "extracting")) return;
		const next = state.items.find((item) => item.status === "queued");
		if (!next) return;
		let tab;
		try {
			const url =
				next.extractionStage === "company"
					? Northgrain.canonicalCompanyUrl(next.details.companyLinkedInUrl)
					: `${next.details.profileUrl}/details/experience/`;
			if (!url) {
				await updateState((current) => {
					const item = current.items.find((entry) => entry.id === next.id);
					if (item) item.status = "ready";
					return current;
				});
				return;
			}
			tab = await call(api.tabs, "create", {
				url,
				active: false,
			});
			await updateState((current) => {
				const item = current.items.find((entry) => entry.id === next.id);
				if (item) {
					item.status = "extracting";
					item.extractionTabId = tab.id;
					item.extractionStartedAt = Date.now();
				}
				return current;
			});
			setTimeout(
				() => void finishExtraction(next.id, tab.id, null),
				EXTRACTION_TIMEOUT_MS,
			);
		} catch (error) {
			await finishExtraction(next.id, tab?.id, null, Northgrain.message(error));
		}
	} finally {
		extractionRunning = false;
	}
}

async function recoverExtractionQueue() {
	const state = await readState();
	const stale = state.items.find(
		(item) =>
			item.status === "extracting" &&
			Date.now() - (item.extractionStartedAt ?? 0) >= EXTRACTION_TIMEOUT_MS,
	);
	if (stale) {
		await finishExtraction(
			stale.id,
			stale.extractionTabId,
			null,
			"LinkedIn did not finish loading. Review the captured invitation details.",
		);
		return;
	}
	void processExtractionQueue();
}

async function finishExtraction(id, tabId, details, warning) {
	let matched = false;
	await updateState((state) => {
		const item = state.items.find((entry) => entry.id === id);
		if (item?.status !== "extracting" || item.extractionTabId !== tabId) {
			return state;
		}
		matched = true;
		const stage = item.extractionStage;
		item.details = details
			? mergeExtractedDetails(item.details, details)
			: item.details;
		const companyUrl = Northgrain.canonicalCompanyUrl(
			item.details.companyLinkedInUrl,
		);
		if (stage === "profile" && companyUrl) {
			item.status = "queued";
			item.extractionStage = "company";
		} else {
			item.status = "ready";
			delete item.extractionStage;
		}
		item.warning =
			warning ||
			(stage === "profile" && !companyUrl
				? "LinkedIn did not expose a company page link, so the company website could not be extracted."
				: stage === "companySearch"
					? "LinkedIn did not expose one unambiguous exact company page, so the company website was left empty."
					: stage === "company" && !item.details.companyWebsite
						? "The LinkedIn company About page did not expose a Website field, so the company website was left empty."
						: undefined);
		delete item.extractionTabId;
		delete item.extractionStartedAt;
		return state;
	});
	if (!matched) return;
	if (tabId) await call(api.tabs, "remove", tabId).catch(() => undefined);
	void processExtractionQueue();
}

function mergeExtractedDetails(original, details) {
	return {
		...original,
		...Object.fromEntries(
			Object.entries(details).filter(
				([, value]) => value !== "" && value != null,
			),
		),
		profileUrl: original.profileUrl,
		firstName: original.firstName,
		lastName: original.lastName,
		reason: original.reason,
		inbound: original.inbound,
		connectionStatus: original.connectionStatus,
		connectedAt: original.connectedAt,
		createFollowUp: original.createFollowUp,
	};
}

async function settings() {
	const stored = await call(api.storage.local, "get", Northgrain.settingsKeys);
	return {
		apiUrl:
			stored.apiUrl ??
			globalThis.NORTHGRAIN_EXTENSION_CONFIG?.apiUrl ??
			"http://localhost:3001",
		token: stored.token ?? "",
	};
}

async function request(path, options = {}) {
	const { apiUrl, token } = await settings();
	if (!apiUrl || !token) {
		const error = new Error("Add a CRM API token in the extension toolbar.");
		error.status = 401;
		throw error;
	}
	let response;
	try {
		response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
			...options,
			headers: {
				authorization: `Bearer ${token}`,
				...(options.body ? { "content-type": "application/json" } : {}),
			},
			signal: AbortSignal.timeout(15_000),
		});
	} catch (cause) {
		throw new Error(
			"Unable to reach CRM. The capture will retry automatically.",
			{
				cause,
			},
		);
	}
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		const raw = body.message;
		const message =
			typeof raw === "string"
				? raw
				: response.status === 403
					? "The API token is invalid, expired, or missing crm:write access."
					: "CRM rejected this capture. Review the details and try again.";
		const error = new Error(message);
		error.status = response.status;
		error.requestId = body.requestId;
		throw error;
	}
	return body;
}

function retryAt(attempts) {
	const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)];
	return Date.now() + minutes * 60_000;
}

async function syncItem(id) {
	const state = await readState();
	const item = state.items.find((entry) => entry.id === id);
	if (item?.status !== "pending") return;
	try {
		await request("/api/v1/linkedin/captures", {
			method: "POST",
			body: JSON.stringify(item.details),
		});
		await updateState((current) => {
			current.items = current.items.filter((entry) => entry.id !== id);
			return current;
		});
	} catch (error) {
		await updateState((current) => {
			const failed = current.items.find((entry) => entry.id === id);
			if (!failed) return current;
			failed.attempts = (failed.attempts ?? 0) + 1;
			failed.error = {
				message: Northgrain.message(error),
				status: error.status,
				requestId: error.requestId,
			};
			if ([400, 401, 403, 404, 409, 422].includes(error.status)) {
				failed.status = "blocked";
				delete failed.nextAttemptAt;
			} else {
				failed.nextAttemptAt = retryAt(failed.attempts - 1);
			}
			return current;
		});
	}
}

async function syncPending(force = false) {
	const state = await readState();
	if (state.version?.blocked) return;
	const due = state.items.filter(
		(item) =>
			item.status === "pending" &&
			(force || !item.nextAttemptAt || item.nextAttemptAt <= Date.now()),
	);
	for (const item of due) await syncItem(item.id);
}

function compareVersions(left, right) {
	const leftParts = left.split(".").map(Number);
	const rightParts = right.split(".").map(Number);
	for (
		let index = 0;
		index < Math.max(leftParts.length, rightParts.length);
		index += 1
	) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

async function checkVersion() {
	const { apiUrl } = await settings();
	const current = api.runtime.getManifest().version;
	try {
		const response = await fetch(
			`${apiUrl.replace(/\/$/, "")}/extension-downloads/metadata`,
			{ cache: "no-store", signal: AbortSignal.timeout(8_000) },
		);
		if (!response.ok) return;
		const metadata = await response.json();
		await updateState((state) => ({
			...state,
			version: {
				current,
				latest: metadata.latestVersion,
				downloadUrl: metadata.downloadUrl,
				blocked:
					compareVersions(current, metadata.minimumCompatibleVersion) < 0,
			},
		}));
	} catch {
		return;
	}
}

async function connectionTest() {
	try {
		const result = await request("/api/v1/me");
		await checkVersion();
		void syncPending(true);
		return { ok: true, ...result, queue: await readState() };
	} catch (error) {
		return {
			ok: false,
			error: Northgrain.message(error),
			queue: await readState(),
		};
	}
}

async function handle(message, sender) {
	if (message?.type === "northgrain:queue-get")
		return { queue: await readState() };
	if (message?.type === "northgrain:connection-test") return connectionTest();
	if (message?.type === "northgrain:queue-add") {
		return {
			ok: true,
			item: await add(message.details, message.enrich === true),
		};
	}
	if (message?.type === "northgrain:extraction-context") {
		const state = await readState();
		const item = state.items.find(
			(entry) =>
				entry.status === "extracting" &&
				entry.extractionTabId === sender.tab?.id,
		);
		return {
			ok: true,
			extraction: Boolean(item),
			stage: item?.extractionStage,
			companyName: item?.details.companyName,
		};
	}
	if (message?.type === "northgrain:profile-loaded") {
		const state = await readState();
		const item = state.items.find(
			(entry) =>
				entry.status === "extracting" &&
				entry.extractionTabId === sender.tab?.id,
		);
		if (item) await finishExtraction(item.id, sender.tab.id, message.details);
		return { ok: true, extraction: Boolean(item) };
	}
	if (message?.type === "northgrain:profile-company-search") {
		let matched = false;
		await updateState((state) => {
			const item = state.items.find(
				(entry) =>
					entry.status === "extracting" &&
					entry.extractionStage === "profile" &&
					entry.extractionTabId === sender.tab?.id,
			);
			if (!item) return state;
			matched = true;
			item.details = mergeExtractedDetails(item.details, message.details);
			item.extractionStage = "companySearch";
			item.extractionStartedAt = Date.now();
			return state;
		});
		return {
			ok: true,
			extraction: matched,
			searchUrl: matched
				? `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(message.details.companyName)}`
				: undefined,
		};
	}
	if (message?.type === "northgrain:company-search-resolved") {
		const companyUrl = Northgrain.canonicalCompanyUrl(
			message.companyLinkedInUrl,
		);
		if (!companyUrl) {
			const state = await readState();
			const item = state.items.find(
				(entry) =>
					entry.status === "extracting" &&
					entry.extractionStage === "companySearch" &&
					entry.extractionTabId === sender.tab?.id,
			);
			if (item) await finishExtraction(item.id, sender.tab.id, null);
			return { ok: true, extraction: Boolean(item) };
		}
		let matched = false;
		await updateState((state) => {
			const item = state.items.find(
				(entry) =>
					entry.status === "extracting" &&
					entry.extractionStage === "companySearch" &&
					entry.extractionTabId === sender.tab?.id,
			);
			if (!item) return state;
			matched = true;
			item.details.companyLinkedInUrl = companyUrl;
			item.extractionStage = "company";
			item.extractionStartedAt = Date.now();
			return state;
		});
		return { ok: true, extraction: matched, companyUrl };
	}
	if (message?.type === "northgrain:company-loaded") {
		const state = await readState();
		const item = state.items.find(
			(entry) =>
				entry.status === "extracting" &&
				entry.extractionStage === "company" &&
				entry.extractionTabId === sender.tab?.id,
		);
		if (item) await finishExtraction(item.id, sender.tab.id, message.details);
		return { ok: true, extraction: Boolean(item) };
	}
	if (message?.type === "northgrain:queue-later") {
		await updateState((state) => {
			const item = state.items.find((entry) => entry.id === message.id);
			if (item) item.status = "later";
			return state;
		});
		return { ok: true };
	}
	if (message?.type === "northgrain:queue-discard") {
		await updateState((state) => {
			state.items = state.items.filter((entry) => entry.id !== message.id);
			return state;
		});
		return { ok: true };
	}
	if (message?.type === "northgrain:queue-save") {
		await updateState((state) => {
			const item = state.items.find((entry) => entry.id === message.id);
			if (item) {
				item.details = message.details;
				item.status = "pending";
				item.attempts = 0;
				delete item.error;
				delete item.nextAttemptAt;
			}
			return state;
		});
		void syncItem(message.id);
		return { ok: true };
	}
	if (message?.type === "northgrain:queue-open") {
		await updateState((state) => {
			const item = state.items.find((entry) => entry.id === message.id);
			if (item?.status === "blocked") {
				item.status = "pending";
				delete item.error;
				delete item.nextAttemptAt;
			} else if (item) item.status = "ready";
			return state;
		});
		void syncItem(message.id);
		return { ok: true };
	}
	if (message?.type === "northgrain:queue-pause") {
		await updateState((state) => ({
			...state,
			paused: message.paused === true,
		}));
		return { ok: true };
	}
	return undefined;
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message?.type?.startsWith("northgrain:")) return false;
	handle(message, sender)
		.then((response) => sendResponse(response))
		.catch((error) =>
			sendResponse({ ok: false, error: Northgrain.message(error) }),
		);
	return true;
});

api.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) {
		void syncPending();
		void recoverExtractionQueue();
	}
});

api.tabs.onRemoved.addListener((tabId) => {
	void readState().then((state) => {
		const item = state.items.find(
			(entry) =>
				entry.status === "extracting" && entry.extractionTabId === tabId,
		);
		if (item)
			void finishExtraction(
				item.id,
				tabId,
				null,
				"Profile extraction was interrupted.",
			);
	});
});

async function start() {
	api.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
	await upgradeIncompleteDrafts();
	void checkVersion();
	void recoverExtractionQueue();
	void syncPending();
}

void start();
