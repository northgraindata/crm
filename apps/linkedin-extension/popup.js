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

function text(value) {
	return typeof value === "string" ? value.trim() : "";
}

async function saveConnection() {
	const apiUrl = text(byId("api-url").value).replace(/\/$/, "");
	const token = text(byId("token").value);
	await setStored({ apiUrl, token });
	byId("status").textContent = "Connection settings saved.";
}

async function load() {
	const saved = await getStored();
	byId("api-url").value =
		saved.apiUrl ?? configuredApiUrl ?? "http://localhost:3001";
	byId("token").value = saved.token ?? "";
}

byId("connection-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	await saveConnection();
});

void load();
