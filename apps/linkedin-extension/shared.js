(() => {
	const clean = (value) => value?.replace(/\s+/g, " ").trim() ?? "";

	function canonicalProfileUrl(value) {
		try {
			const url = new URL(value, "https://www.linkedin.com");
			if (!["linkedin.com", "www.linkedin.com"].includes(url.hostname))
				return "";
			const match = /^\/in\/([^/]+)/i.exec(url.pathname);
			return match
				? `https://www.linkedin.com/in/${match[1].toLowerCase()}`
				: "";
		} catch {
			return "";
		}
	}

	function personName(value) {
		const parts = clean(value).split(" ").filter(Boolean);
		return { firstName: parts.shift() ?? "", lastName: parts.join(" ") };
	}

	function canonicalCompanyUrl(value) {
		try {
			const url = new URL(value, "https://www.linkedin.com");
			if (!["linkedin.com", "www.linkedin.com"].includes(url.hostname))
				return "";
			const match = /^\/company\/([^/]+)/i.exec(url.pathname);
			return match
				? `https://www.linkedin.com/company/${match[1].toLowerCase()}/about/`
				: "";
		} catch {
			return "";
		}
	}

	function message(error, fallback = "Unable to complete this action.") {
		return error instanceof Error ? error.message : fallback;
	}

	globalThis.Northgrain = {
		clean,
		canonicalProfileUrl,
		canonicalCompanyUrl,
		personName,
		message,
		queueKey: "northgrainQueueV1",
		settingsKeys: ["apiUrl", "token"],
	};
})();
