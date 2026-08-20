const api = globalThis.browser ?? globalThis.chrome;
const configuredApiUrl = globalThis.NORTHGRAIN_EXTENSION_CONFIG?.apiUrl;
const byId = (id) => document.getElementById(id);

function call(target, method, ...args) {
	return new Promise((resolve, reject) => {
		target[method](...args, (value) => {
			const error = api.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve(value);
		});
	});
}

const runtimeMessage = (message) => call(api.runtime, "sendMessage", message);
const text = (value) => (typeof value === "string" ? value.trim() : "");

async function saveConnection() {
	const apiUrl = text(byId("api-url").value).replace(/\/$/, "");
	const token = text(byId("token").value);
	await call(api.storage.local, "set", { apiUrl, token });
	const response = await runtimeMessage({ type: "northgrain:connection-test" });
	if (!response?.ok)
		throw new Error(response?.error ?? "Unable to connect to CRM.");
	byId("status").textContent = response.user?.email
		? `Connected as ${response.user.email}.`
		: "Connected to CRM.";
	await renderQueue(response.queue);
}

function statusLabel(item) {
	if (item.status === "extracting") return "Extracting profile";
	if (item.status === "queued") return "Waiting to extract";
	if (item.status === "ready" || item.status === "later")
		return "Ready to review";
	if (item.status === "pending") return "Waiting to sync";
	return item.error?.message ?? "Needs attention";
}

async function renderQueue(state) {
	const queue = byId("queue");
	queue.replaceChildren();
	if (state?.version?.blocked && state.version.downloadUrl) {
		const upgrade = document.createElement("a");
		upgrade.href = state.version.downloadUrl;
		upgrade.target = "_blank";
		upgrade.rel = "noreferrer";
		upgrade.textContent = `Download required update ${state.version.latest}`;
		queue.append(upgrade);
	}
	const items = state?.items ?? [];
	if (items.length === 0) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "No people waiting.";
		queue.append(empty);
		return;
	}
	for (const item of items) {
		const row = document.createElement("div");
		row.className = "queue-item";
		const name = document.createElement("strong");
		name.textContent = [item.details.firstName, item.details.lastName]
			.filter(Boolean)
			.join(" ");
		const status = document.createElement("span");
		status.textContent = statusLabel(item);
		row.append(name, status);
		if (["ready", "later", "blocked"].includes(item.status)) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = item.status === "blocked" ? "Retry" : "Review";
			button.addEventListener("click", async () => {
				await runtimeMessage({ type: "northgrain:queue-open", id: item.id });
				window.close();
			});
			row.append(button);
		}
		queue.append(row);
	}
}

async function load() {
	const saved = await call(api.storage.local, "get", ["apiUrl", "token"]);
	byId("api-url").value =
		saved.apiUrl ?? configuredApiUrl ?? "http://localhost:3001";
	byId("token").value = saved.token ?? "";
	const response = await runtimeMessage({ type: "northgrain:queue-get" });
	await renderQueue(response?.queue);
}

byId("connection-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	byId("status").textContent = "Testing connection…";
	try {
		await saveConnection();
	} catch (error) {
		byId("status").textContent = Northgrain.message(
			error,
			"Unable to connect to CRM.",
		);
	}
});

byId("capture-current").addEventListener("click", async () => {
	const tabs = await call(api.tabs, "query", {
		active: true,
		currentWindow: true,
	});
	const tab = tabs[0];
	if (!tab?.id) return;
	try {
		await call(api.tabs, "sendMessage", tab.id, {
			type: "northgrain:capture-current",
		});
		window.close();
	} catch {
		byId("status").textContent = "Open a LinkedIn profile and try again.";
	}
});

void load();
