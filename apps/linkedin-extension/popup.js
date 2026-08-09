const api = globalThis.browser ?? globalThis.chrome;
const configuredApiUrl = globalThis.NORTHGRAIN_EXTENSION_CONFIG?.apiUrl;
const byId = (id) => document.getElementById(id);
const storage = api.storage.local;

function getStored() {
	return new Promise((resolve) => storage.get(["apiUrl", "token"], resolve));
}

function setStored(values) {
	return new Promise((resolve) => storage.set(values, resolve));
}

function getActiveTab() {
	return new Promise((resolve) =>
		api.tabs.query({ active: true, currentWindow: true }, (tabs) =>
			resolve(tabs[0]),
		),
	);
}

function text(value) {
	return typeof value === "string" ? value.trim() : "";
}

async function saveConnection() {
	const apiUrl = text(byId("api-url").value).replace(/\/$/, "");
	const token = text(byId("token").value);
	await setStored({ apiUrl, token });
}

async function load() {
	const saved = await getStored();
	byId("api-url").value =
		saved.apiUrl ?? configuredApiUrl ?? "http://localhost:3001";
	byId("token").value = saved.token ?? "";
	const tab = await getActiveTab();
	byId("status").textContent = tab?.url?.includes("linkedin.com/in/")
		? "LinkedIn profile URL detected. Confirm the fields manually."
		: "Open a LinkedIn profile, then use the extension button.";
}

byId("api-url").addEventListener("change", async () => {
	await saveConnection();
	byId("status").textContent = "Connection settings saved.";
});

byId("token").addEventListener("change", async () => {
	await saveConnection();
	byId("status").textContent = "Connection settings saved.";
});

byId("capture-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const status = byId("status");
	status.textContent = "Saving…";
	try {
		const tab = await getActiveTab();
		if (!tab?.url?.includes("linkedin.com/in/"))
			throw new Error("The active tab is not a LinkedIn profile.");
		await saveConnection();
		const apiUrl = text(byId("api-url").value).replace(/\/$/, "");
		const token = text(byId("token").value);
		const response = await fetch(`${apiUrl}/api/v1/linkedin/captures`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				profileUrl: tab.url,
				firstName: text(byId("first-name").value),
				lastName: text(byId("last-name").value) || undefined,
				title: text(byId("title").value) || undefined,
				companyName: text(byId("company-name").value) || undefined,
				companyDomain: text(byId("company-domain").value) || undefined,
				reason: byId("reason").value,
				inbound: byId("inbound").checked,
				connectionStatus: byId("connection-status").value,
				createFollowUp: byId("follow-up").checked,
			}),
		});
		if (!response.ok) throw new Error(await response.text());
		const result = await response.json();
		status.textContent = result.taskId
			? "Saved and follow-up created."
			: "Saved to Northgrain.";
	} catch (error) {
		status.textContent =
			error instanceof Error ? error.message : "Could not save this contact.";
	}
});

void load();
