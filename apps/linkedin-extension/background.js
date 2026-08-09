const api = globalThis.browser ?? globalThis.chrome;

function getStored(keys) {
	return new Promise((resolve) => api.storage.local.get(keys, resolve));
}

async function capture(payload) {
	const { apiUrl, token } = await getStored(["apiUrl", "token"]);
	if (!apiUrl || !token) {
		throw new Error(
			"Open Northgrain settings from the extension toolbar and add your API token.",
		);
	}
	const response = await fetch(
		`${apiUrl.replace(/\/$/, "")}/api/v1/linkedin/captures`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(payload),
		},
	);
	if (!response.ok) {
		const message = await response.text();
		throw new Error(message || "Northgrain could not save this person.");
	}
	return response.json();
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== "northgrain:capture") return false;
	capture(message.payload)
		.then((result) => sendResponse({ ok: true, result }))
		.catch((error) =>
			sendResponse({
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Northgrain could not save this person.",
			}),
		);
	return true;
});
