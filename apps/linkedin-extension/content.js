(() => {
	if (globalThis.__northgrainContentVersion === apiVersion()) return;
	globalThis.__northgrainContentVersion = apiVersion();
	const api = globalThis.browser ?? globalThis.chrome;
	const PROFILE_PATH = /^\/in\/[^/]+/;
	const COMPANY_PATH = /^\/company\/[^/]+/;
	const COMPANY_SEARCH_PATH = /^\/search\/results\/companies/;
	const EXTRACTION_WAIT_MS = 30_000;
	const UI_HOST_ID = "northgrain-capture-ui";
	const ACTION_HOST_ID = "northgrain-profile-action";
	let queue = { items: [], paused: false };
	let root;
	let reviewItemId = null;
	let restoreFocus = null;
	let inertState = [];
	let workerTab = false;
	const replayedAcceptButtons = new WeakSet();

	function apiVersion() {
		return globalThis.chrome?.runtime?.getManifest?.().version ?? "unknown";
	}

	function call(target, method, ...args) {
		return new Promise((resolve, reject) => {
			target[method](...args, (value) => {
				const error = api.runtime.lastError;
				if (error) reject(new Error(error.message));
				else resolve(value);
			});
		});
	}

	const send = (message) => call(api.runtime, "sendMessage", message);
	const clean = Northgrain.clean;

	function visibleText(element) {
		if (!(element instanceof HTMLElement)) return "";
		const style = globalThis.getComputedStyle?.(element);
		return style?.display === "none" || style?.visibility === "hidden"
			? ""
			: clean(element.textContent);
	}

	function isPersonName(value) {
		const words = clean(value).split(" ").filter(Boolean);
		return (
			words.length >= 1 &&
			words.length <= 6 &&
			words.every((word) => /^[\p{L}'’,.-]+$/u.test(word)) &&
			!/notifications|people|invitations|highlights|about|activity|experience/i.test(
				value,
			)
		);
	}

	function profileSection() {
		const sections = [
			...document.querySelectorAll('section[componentkey*="Topcard" i]'),
		];
		return (
			sections.find((section) =>
				[...section.querySelectorAll("h1, h2")].some((heading) =>
					isPersonName(visibleText(heading)),
				),
			) ?? document.querySelector("main")
		);
	}

	function profileName(section) {
		const heading = [...(section?.querySelectorAll("h1, h2") ?? [])]
			.map(visibleText)
			.find(isPersonName);
		if (heading) return heading;
		const metadata = clean(
			document
				.querySelector('meta[property="og:title"]')
				?.getAttribute("content") ?? document.title,
		)
			.replace(/(?:'s|’s) profile.*$/i, "")
			.replace(/\s*[|_-]\s*LinkedIn.*$/i, "");
		if (isPersonName(metadata)) return metadata;
		const slug = /^\/in\/([^/]+)/.exec(location.pathname)?.[1] ?? "";
		return clean(slug.replace(/-\d+$/, "").replace(/[-_]+/g, " "));
	}

	function uniqueLines(elements) {
		return [...elements]
			.map(visibleText)
			.filter((line, index, lines) => line && lines.indexOf(line) === index);
	}

	function isMetadata(line) {
		return (
			/^·?\s*(?:1st|2nd|3rd)\s*$/i.test(line) ||
			line === "·" ||
			/^(?:contact info|informacje kontaktowe)$/i.test(line) ||
			/\bmutual connection/i.test(line) ||
			/^\d[\d,.\s]*\+?\s*(?:followers?|connections?)$/i.test(line)
		);
	}

	function topCardLines(section) {
		return uniqueLines(section?.querySelectorAll("p") ?? []).filter(
			(line) => !isMetadata(line),
		);
	}

	function currentExperience() {
		const anchor = document.querySelector(
			'[componentkey*="Experience"], [id*="ExperienceTopLevelSection"], #experience',
		);
		const section =
			anchor?.closest("section") ??
			anchor ??
			(location.pathname.includes("/details/experience/")
				? document.querySelector("main")
				: null);
		const detailsCompanyLink = location.pathname.includes(
			"/details/experience/",
		)
			? document.querySelector('main a[href*="/company/"]')
			: null;
		const currentMarker = [
			...(section?.querySelectorAll('span[aria-hidden="true"], p') ?? []),
		].find((element) =>
			/\b(?:present|obecnie|présent|presente|heute|attualmente)\b/i.test(
				visibleText(element),
			),
		);
		const item =
			currentMarker?.closest("li") ??
			detailsCompanyLink?.closest("li") ??
			section?.querySelector("li") ??
			detailsCompanyLink?.parentElement;
		let companyItem = item;
		let companyLink;
		while (companyItem && section?.contains(companyItem)) {
			companyLink = [
				...companyItem.querySelectorAll('a[href*="/company/"]'),
			].find((link) => link.closest("li") === companyItem && visibleText(link));
			if (companyLink) break;
			companyItem = companyItem.parentElement?.closest("li");
		}
		const roleLines = uniqueLines(
			item?.querySelectorAll('span[aria-hidden="true"], p') ?? [],
		);
		const companyLines = uniqueLines(
			companyLink?.querySelectorAll('span[aria-hidden="true"], p') ?? [],
		);
		const companyLine =
			companyItem === item
				? roleLines[1] || companyLines[0]
				: companyLines[0] || visibleText(companyLink) || roleLines[1];
		const companyName = clean(
			companyLine
				.split("·")[0]
				.replace(
					/\s+(?:permanent|full-time|part-time|contract|self-employed|freelance|internship|temporary|apprenticeship|seasonal)\b.*$/i,
					"",
				),
		);
		return {
			title: roleLines[0] ?? "",
			companyName,
			companyLinkedInUrl: companyLink?.href,
		};
	}

	function companyDetails(section, lines, experience) {
		const summary = lines.find((line) => line.includes("·"));
		const name =
			experience.companyName || clean(summary?.split("·")[0]) || undefined;
		const link = [
			...(section?.querySelectorAll('a[href*="/company/"]') ?? []),
		].find((entry) => !name || visibleText(entry).includes(name));
		return {
			name,
			summary,
			linkedinUrl: experience.companyLinkedInUrl || link?.href || undefined,
		};
	}

	function companyNavigationControl(details) {
		if (!details.companyName || details.companyLinkedInUrl) return null;
		return [
			...(document.querySelectorAll('main button, main [role="button"]') ?? []),
		].find((control) => visibleText(control) === details.companyName);
	}

	function companySearchResult(companyName) {
		const wanted = clean(companyName).toLocaleLowerCase();
		const links = [...document.querySelectorAll('main a[href*="/company/"]')];
		const exact = links.filter(
			(link) => visibleText(link).toLocaleLowerCase() === wanted,
		);
		const urls = [
			...new Set(
				exact
					.map((link) => Northgrain.canonicalCompanyUrl(link.href))
					.filter(Boolean),
			),
		];
		return {
			companyLinkedInUrl: urls.length === 1 ? urls[0] : undefined,
			...(urls.length > 1 ? { companySearchAmbiguous: true } : {}),
		};
	}

	function externalWebsiteUrl(value) {
		try {
			const url = new URL(value);
			if (url.hostname.endsWith("linkedin.com")) {
				const redirected = url.searchParams.get("url");
				if (!redirected) return "";
				return externalWebsiteUrl(redirected);
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") return "";
			return url.href;
		} catch {
			return "";
		}
	}

	function companyWebsiteDetails() {
		const companyName = clean(
			document.querySelector("main h1")?.textContent ?? "",
		);
		const websiteHeading = [
			...document.querySelectorAll("h1, h2, h3, dt"),
		].find((element) =>
			/^(?:website|strona internetowa)$/i.test(visibleText(element)),
		);
		const websiteContainer = websiteHeading?.closest("dt, div, li");
		const detailsLink =
			websiteContainer?.querySelector('a[href^="http"]') ??
			websiteContainer?.nextElementSibling?.querySelector('a[href^="http"]') ??
			websiteHeading?.parentElement?.parentElement?.querySelector(
				'a[href^="http"]',
			);
		const website = externalWebsiteUrl(detailsLink?.href);
		if (!website) return {};
		const domain = new URL(website).hostname
			.replace(/^www\./i, "")
			.toLowerCase();
		return {
			companyName: companyName || undefined,
			companyWebsite: website,
			companyDomain: domain,
			companyWebsiteSource: "details",
		};
	}

	async function stableDetails(extract, complete) {
		const startedAt = Date.now();
		let best = extract();
		let previous = "";
		let stable = 0;
		while (Date.now() - startedAt < EXTRACTION_WAIT_MS) {
			const current = extract();
			if (
				Object.keys(current).filter((key) => current[key]).length >=
				Object.keys(best).filter((key) => best[key]).length
			)
				best = current;
			const signature = JSON.stringify(current);
			stable = signature === previous ? stable + 1 : 0;
			if (complete(current) && stable >= 2) return current;
			previous = signature;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		return best;
	}

	function profileDetails() {
		const section = profileSection();
		const name = Northgrain.personName(profileName(section));
		const lines = topCardLines(section);
		const headline = lines.find((line) => !line.includes("Contact info")) ?? "";
		const experience = currentExperience();
		const company = companyDetails(section, lines, experience);
		const summaryIndex = company.summary ? lines.indexOf(company.summary) : -1;
		const image = section?.querySelector(
			'[componentkey="topcard-logo-image-referencekey"] img, [aria-label="Profile photo"] img, img[alt*="profile picture" i], img[alt*="profile photo" i]',
		);
		const email = clean(
			section?.querySelector('a[href^="mailto:"]')?.getAttribute("href"),
		).replace(/^mailto:/i, "");
		return {
			profileUrl: Northgrain.canonicalProfileUrl(location.href),
			...name,
			title: experience.title || clean(headline.split(/[|｜]/)[0]),
			headline: headline || undefined,
			location: summaryIndex >= 0 ? lines[summaryIndex + 1] : undefined,
			companyName: company.name,
			companyLinkedInUrl: company.linkedinUrl,
			email: email || undefined,
			imageUrl: image?.currentSrc || image?.src || undefined,
			reason: "Potential client",
			inbound: false,
			connectionStatus: "unknown",
			createFollowUp: false,
		};
	}

	function invitationDetails(button) {
		const card =
			button.closest('[role="listitem"][componentkey^="urn:li:invitation:"]') ??
			button.closest('[role="listitem"]') ??
			button.closest("li");
		const profileLinks = [
			...(card?.querySelectorAll('a[href*="/in/"]') ?? []),
		].filter((link) => Northgrain.canonicalProfileUrl(link.href));
		const profileLink = profileLinks[0];
		const strongName = visibleText(
			card?.querySelector('a[href*="/in/"] strong'),
		);
		const labelledName = clean(button.getAttribute("aria-label"))
			.replace(/^Accept\s+/i, "")
			.replace(/(?:’s|'s) invitation.*$/i, "");
		const nameText = isPersonName(strongName) ? strongName : labelledName;
		const lines = uniqueLines(card?.querySelectorAll("p") ?? []);
		const headline = lines.find(
			(line) =>
				!line.includes(nameText) &&
				!/mutual connection|wants to connect|accept|ignore/i.test(line),
		);
		const image = card?.querySelector('a[href*="/in/"] img');
		return {
			profileUrl: Northgrain.canonicalProfileUrl(profileLink?.href ?? ""),
			...Northgrain.personName(nameText),
			title: clean(headline?.split(/[|｜]/)[0]),
			headline: headline || undefined,
			imageUrl: image?.currentSrc || image?.src || undefined,
			reason: "Relationship",
			inbound: true,
			connectionStatus: "connected",
			connectedAt: new Date().toISOString(),
			createFollowUp: true,
		};
	}

	function isAcceptButton(button) {
		const label = `${button.getAttribute("aria-label") ?? ""} ${visibleText(button)}`;
		return /\baccept\b|zaakceptuj|accepter|aceptar|annehmen|accetta|aceitar/i.test(
			label,
		);
	}

	Northgrain.extractProfile = profileDetails;
	Northgrain.extractInvitation = invitationDetails;
	Northgrain.extractCompanyWebsite = companyWebsiteDetails;
	Northgrain.hasCompanyNavigationControl = () =>
		Boolean(companyNavigationControl(profileDetails()));
	Northgrain.extractCompanySearchResult = companySearchResult;

	function styles() {
		return `
			:host { all: initial; color-scheme: light; font-family: system-ui, sans-serif; }
			.status-wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; display: grid; justify-items: end; gap: 8px; }
			.status-button { display: flex; align-items: center; gap: 9px; min-height: 42px; border: 1px solid #006b4f; border-radius: 21px; padding: 8px 14px; color: #fff; background: #006b4f; box-shadow: 0 8px 24px rgb(0 0 0 / .2); cursor: pointer; font: 650 13px/1.3 system-ui, sans-serif; }
			.spinner { width: 15px; height: 15px; border: 2px solid rgb(255 255 255 / .45); border-top-color: #fff; border-radius: 50%; }
			@media (prefers-reduced-motion: no-preference) { .spinner { animation: spin .8s linear infinite; } }
			@keyframes spin { to { transform: rotate(360deg); } }
			.panel { box-sizing: border-box; width: min(380px, calc(100vw - 40px)); max-height: min(520px, calc(100vh - 90px)); overflow: auto; border: 1px solid #d6d6d6; border-radius: 8px; padding: 14px; color: #1b1d1c; background: #fff; box-shadow: 0 12px 32px rgb(0 0 0 / .2); }
			.panel[hidden] { display: none; }
			.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
			h2, h3, p { margin: 0; }
			.panel h2 { font-size: 16px; }
			.queue-list { display: grid; gap: 8px; }
			.queue-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; align-items: center; border-top: 1px solid #e6e6e6; padding-top: 8px; }
			.queue-item:first-child { border-top: 0; }
			.queue-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 700; }
			.queue-state { color: #666; font-size: 12px; }
			.small { min-height: 32px; border: 1px solid #c9cfcc; border-radius: 5px; padding: 5px 9px; color: #303633; background: #fff; cursor: pointer; font: 650 12px system-ui, sans-serif; }
			.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / .42); }
			.backdrop[hidden] { display: none; }
			.dialog { box-sizing: border-box; width: min(560px, 100%); max-height: calc(100vh - 48px); overflow: auto; overscroll-behavior: contain; border-radius: 8px; padding: 24px; color: #1b1d1c; background: #fff; box-shadow: 0 12px 32px rgb(0 0 0 / .24); }
			.dialog-head { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
			.dialog h2 { font-size: 20px; line-height: 1.3; }
			.profile-link { display: inline-block; margin-top: 5px; color: #006b4f; font-size: 13px; font-weight: 650; }
			.icon { width: 40px; min-height: 40px; border: 0; padding: 0; color: #303633; background: transparent; cursor: pointer; font: 24px/1 system-ui, sans-serif; }
			.notice { margin: 14px 0; color: #5b625f; font-size: 13px; line-height: 1.45; }
			.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
			.full { grid-column: 1 / -1; }
			label { display: grid; gap: 5px; color: #303633; font-size: 13px; font-weight: 650; }
			input, select, .action { box-sizing: border-box; min-height: 40px; border-radius: 5px; font: inherit; }
			input, select { width: 100%; border: 1px solid #aeb6b2; padding: 8px 10px; color: #1b1d1c; background: #fff; }
			.check { display: flex; align-items: center; gap: 9px; min-height: 40px; font-weight: 500; }
			.check input { width: 18px; min-height: 18px; margin: 0; }
			.actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 22px; }
			.action { border: 1px solid #c9cfcc; padding: 8px 16px; color: #303633; background: #fff; cursor: pointer; font-weight: 700; }
			.primary { border-color: #006b4f; color: #fff; background: #006b4f; }
			.destructive { border-color: #b42318; color: #b42318; }
			button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid #006b4f; outline-offset: 2px; }
			.confirm { border: 1px solid #d6d6d6; border-radius: 8px; padding: 18px; background: #fff; }
			.confirm h3 { font-size: 17px; }
			.confirm p { margin-top: 7px; color: #5b625f; font-size: 13px; line-height: 1.45; }
			@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } .full { grid-column: auto; } .dialog { padding: 20px; } }
		`;
	}

	function mountUi() {
		if (workerTab || document.getElementById(UI_HOST_ID) || !document.body)
			return;
		const host = document.createElement("div");
		host.id = UI_HOST_ID;
		document.body.append(host);
		root = host.attachShadow({ mode: "closed" });
		root.innerHTML = `
			<style>${styles()}</style>
			<div class="status-wrap">
				<section class="panel" hidden aria-labelledby="northgrain-queue-title">
					<div class="panel-head"><h2 id="northgrain-queue-title">Capture queue</h2><button class="small pause" type="button"></button></div>
					<div class="queue-list"></div>
				</section>
				<button class="status-button" type="button" aria-expanded="false"><span class="indicator"></span><span class="status-text"></span></button>
			</div>
			<div class="backdrop" hidden></div>`;
		root.querySelector(".status-button").addEventListener("click", () => {
			const panel = root.querySelector(".panel");
			panel.hidden = !panel.hidden;
			root
				.querySelector(".status-button")
				.setAttribute("aria-expanded", String(!panel.hidden));
		});
		root.querySelector(".pause").addEventListener("click", () => {
			void send({ type: "northgrain:queue-pause", paused: !queue.paused });
		});
		renderQueue();
	}

	function queueStatus(item) {
		if (item.status === "extracting")
			return item.extractionStage === "company"
				? "Extracting company website"
				: item.extractionStage === "companySearch"
					? "Finding company page"
					: "Extracting profile";
		if (item.status === "queued") return "Waiting to extract";
		if (["ready", "later"].includes(item.status)) return "Ready to review";
		if (item.status === "pending") return "Waiting to sync";
		return item.error?.message ?? "Needs attention";
	}

	function renderQueue() {
		if (!root) return;
		const extracting = queue.items.find((item) => item.status === "extracting");
		const ready = queue.items.filter((item) =>
			["ready", "later"].includes(item.status),
		);
		const blocked = queue.items.filter((item) => item.status === "blocked");
		const waiting = queue.items.filter((item) => item.status === "queued");
		const pending = queue.items.filter((item) => item.status === "pending");
		const extractionName =
			extracting?.extractionStage === "company"
				? extracting.details.companyName || itemName(extracting)
				: extracting
					? itemName(extracting)
					: "";
		const text = queue.version?.blocked
			? "Update Northgrain extension"
			: extracting
				? `Extracting ${extractionName}${waiting.length ? ` · ${waiting.length} waiting` : ""}`
				: ready.length
					? `${ready.length} ready to review`
					: blocked.length
						? `${blocked.length} need attention`
						: pending.length
							? `Syncing ${pending.length} ${pending.length === 1 ? "person" : "people"}`
							: "Capture with Northgrain";
		root.querySelector(".status-text").textContent = text;
		root.querySelector(".indicator").className =
			extracting || pending.length ? "indicator spinner" : "indicator";
		root.querySelector(".pause").textContent = queue.paused
			? "Resume reviews"
			: "Pause reviews";
		const list = root.querySelector(".queue-list");
		list.replaceChildren();
		if (queue.version?.blocked && queue.version.downloadUrl) {
			const upgrade = document.createElement("a");
			upgrade.className = "profile-link";
			upgrade.href = queue.version.downloadUrl;
			upgrade.target = "_blank";
			upgrade.rel = "noreferrer";
			upgrade.textContent = `Download version ${queue.version.latest}`;
			list.append(upgrade);
		}
		if (queue.items.length === 0) {
			const empty = document.createElement("p");
			empty.className = "queue-state";
			empty.textContent = "No people waiting.";
			list.append(empty);
		}
		for (const item of queue.items) {
			const row = document.createElement("div");
			row.className = "queue-item";
			const name = document.createElement("span");
			name.className = "queue-name";
			name.textContent = itemName(item);
			const status = document.createElement("span");
			status.className = "queue-state";
			status.textContent = queueStatus(item);
			row.append(name, status);
			if (["ready", "later"].includes(item.status)) {
				const review = document.createElement("button");
				review.className = "small";
				review.type = "button";
				review.textContent = "Review";
				review.addEventListener("click", () => openReview(item));
				row.append(review);
			}
			list.append(row);
		}
		if (!reviewItemId && !queue.paused) {
			const next = queue.items.find((item) => item.status === "ready");
			if (next) setTimeout(() => openReview(next), 0);
		}
	}

	function itemName(item) {
		return [item.details.firstName, item.details.lastName]
			.filter(Boolean)
			.join(" ");
	}

	function setBackgroundInert(value) {
		if (value) {
			restoreFocus = document.activeElement;
			const host = document.getElementById(UI_HOST_ID);
			inertState = [...document.body.children]
				.filter((element) => element !== host)
				.map((element) => [element, element.inert]);
			for (const [element] of inertState) element.inert = true;
			return;
		}
		for (const [element, wasInert] of inertState) element.inert = wasInert;
		inertState = [];
		restoreFocus?.focus();
		restoreFocus = null;
	}

	function closeReview() {
		reviewItemId = null;
		root.querySelector(".backdrop").hidden = true;
		root.querySelector(".backdrop").replaceChildren();
		setBackgroundInert(false);
		setTimeout(renderQueue, 0);
	}

	function showConfirmation(kind) {
		const dialog = root.querySelector(".dialog");
		const form = root.querySelector(".review-form");
		form.inert = true;
		const confirm = document.createElement("section");
		confirm.className = "confirm";
		confirm.setAttribute("role", "alertdialog");
		confirm.setAttribute("aria-modal", "true");
		confirm.setAttribute("aria-labelledby", "northgrain-confirm-title");
		const discard = kind === "discard";
		confirm.innerHTML = `<h3 id="northgrain-confirm-title">${discard ? "Discard this draft?" : "Review this person later?"}</h3><p>${discard ? "This removes the captured details from the queue." : "The captured details stay in the queue until you return."}</p><div class="actions"><button class="action continue" type="button">Continue reviewing</button><button class="action ${discard ? "destructive" : "primary"} confirm-action" type="button">${discard ? "Discard draft" : "Keep for later"}</button></div>`;
		dialog.append(confirm);
		confirm.querySelector(".continue").addEventListener("click", () => {
			confirm.remove();
			form.inert = false;
			root.querySelector(".close").focus();
		});
		confirm
			.querySelector(".confirm-action")
			.addEventListener("click", async () => {
				await send({
					type: discard ? "northgrain:queue-discard" : "northgrain:queue-later",
					id: reviewItemId,
				});
				closeReview();
			});
		confirm.querySelector(".continue").focus();
	}

	function openReview(item) {
		if (!root || reviewItemId) return;
		reviewItemId = item.id;
		setBackgroundInert(true);
		const backdrop = root.querySelector(".backdrop");
		backdrop.hidden = false;
		const name = itemName(item);
		backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="northgrain-review-title">
			<form class="review-form">
				<div class="dialog-head"><div><h2 id="northgrain-review-title">Review ${escapeText(name)}</h2><a class="profile-link" href="${escapeAttribute(item.details.profileUrl)}" target="_blank" rel="noreferrer">View LinkedIn profile</a></div><button class="icon close" type="button" aria-label="Close review">×</button></div>
				<p class="notice">${escapeText(item.warning ?? "Review the details LinkedIn made visible before saving this person.")}</p>
				<div class="grid">
					<label>First name<input name="firstName" autocomplete="given-name" required></label>
					<label>Last name<input name="lastName" autocomplete="family-name"></label>
					<label class="full">Title<input name="title" autocomplete="organization-title"></label>
					<label>Company<input name="companyName" autocomplete="organization"></label>
					<label>Company website<input name="companyWebsite" placeholder="https://example.com" inputmode="url"></label>
					<label class="full">Relationship<select name="reason"><option>Potential client</option><option>Partner</option><option>Recruiter</option><option>Relationship</option><option>Other</option></select></label>
					<label class="check full"><input name="createFollowUp" type="checkbox">Create a LinkedIn message follow-up</label>
				</div>
				<p class="notice status" role="status" aria-live="polite"></p>
				<div class="actions"><button class="action discard" type="button">Discard draft</button><button class="action primary save" type="submit">Save person</button></div>
			</form>
		</section>`;
		const form = root.querySelector(".review-form");
		for (const field of [
			"firstName",
			"lastName",
			"title",
			"companyName",
			"companyWebsite",
			"reason",
		]) {
			form.elements[field].value = item.details[field] ?? "";
		}
		form.elements.createFollowUp.checked = item.details.createFollowUp === true;
		root
			.querySelector(".close")
			.addEventListener("click", () => showConfirmation("later"));
		root
			.querySelector(".discard")
			.addEventListener("click", () => showConfirmation("discard"));
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const save = root.querySelector(".save");
			const status = root.querySelector(".status");
			save.disabled = true;
			status.textContent = "Adding this person to the sync queue…";
			const values = Object.fromEntries(new FormData(form));
			try {
				await send({
					type: "northgrain:queue-save",
					id: item.id,
					details: {
						...item.details,
						...values,
						createFollowUp: form.elements.createFollowUp.checked,
					},
				});
				closeReview();
			} catch (error) {
				status.textContent = `Could not queue this person: ${Northgrain.message(error)}`;
				save.disabled = false;
			}
		});
		root.querySelector(".close").focus();
	}

	function escapeText(value) {
		return clean(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;");
	}

	function escapeAttribute(value) {
		return escapeText(value).replaceAll('"', "&quot;");
	}

	function mountProfileAction() {
		const existing = document.getElementById(ACTION_HOST_ID);
		if (!PROFILE_PATH.test(location.pathname)) {
			existing?.remove();
			return;
		}
		if (existing) return;
		const section = profileSection();
		if (!section) return;
		const host = document.createElement("span");
		host.id = ACTION_HOST_ID;
		host.style.cssText = "display:block;margin:12px 24px;";
		const actionRoot = host.attachShadow({ mode: "closed" });
		actionRoot.innerHTML = `<style>button{min-height:40px;border:1px solid #006b4f;border-radius:20px;padding:8px 16px;color:#fff;background:#006b4f;cursor:pointer;font:650 14px system-ui,sans-serif}button:focus-visible{outline:2px solid #006b4f;outline-offset:2px}</style><button type="button">Review in Northgrain</button>`;
		actionRoot
			.querySelector("button")
			.addEventListener("click", () => captureCurrent());
		section.append(host);
	}

	async function captureCurrent() {
		const details = profileDetails();
		if (!details.profileUrl || !details.firstName) return;
		await send({ type: "northgrain:queue-add", details, enrich: true });
	}

	document.addEventListener(
		"click",
		async (event) => {
			const button =
				event.target instanceof Element ? event.target.closest("button") : null;
			if (
				!button ||
				!isAcceptButton(button) ||
				replayedAcceptButtons.has(button)
			)
				return;
			const details = invitationDetails(button);
			if (!details.profileUrl || !details.firstName) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			try {
				await send({ type: "northgrain:queue-add", details, enrich: true });
				replayedAcceptButtons.add(button);
				button.click();
			} catch (error) {
				mountUi();
				root.querySelector(".status-text").textContent =
					`Invitation not accepted: ${Northgrain.message(error)}`;
			}
		},
		true,
	);

	api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type === "northgrain:queue-state") {
			queue = message.queue;
			mountUi();
			renderQueue();
			sendResponse({ ok: true, version: apiVersion() });
			return false;
		}
		if (message?.type === "northgrain:capture-current") {
			captureCurrent()
				.then(() => sendResponse({ ok: true }))
				.catch((error) =>
					sendResponse({ ok: false, error: Northgrain.message(error) }),
				);
			return true;
		}
		return false;
	});

	document.addEventListener("keydown", (event) => {
		if (!reviewItemId) return;
		if (event.key === "Escape") {
			event.preventDefault();
			if (!root.querySelector(".confirm")) showConfirmation("later");
			return;
		}
		if (event.key !== "Tab") return;
		const scope =
			root.querySelector(".confirm") ?? root.querySelector(".dialog");
		const focusable = [
			...scope.querySelectorAll(
				"button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
			),
		].filter((element) => !element.closest("[inert]"));
		if (focusable.length === 0) return;
		const active = root.activeElement;
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && (active === first || !focusable.includes(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	});

	let scheduled = false;
	const observer = new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			mountProfileAction();
		}, 200);
	});
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	async function start() {
		if (
			PROFILE_PATH.test(location.pathname) ||
			COMPANY_PATH.test(location.pathname) ||
			COMPANY_SEARCH_PATH.test(location.pathname)
		) {
			const context = await send({ type: "northgrain:extraction-context" });
			workerTab = context?.extraction === true;
			if (workerTab && context.stage === "profile") {
				const details = await stableDetails(profileDetails, (value) =>
					Boolean(
						value.firstName &&
							value.companyName &&
							(value.companyLinkedInUrl || companyNavigationControl(value)),
					),
				);
				const navigationControl = companyNavigationControl(details);
				if (navigationControl) {
					const response = await send({
						type: "northgrain:profile-company-search",
						details,
					});
					if (response?.extraction && response.searchUrl)
						location.assign(response.searchUrl);
				} else {
					await send({ type: "northgrain:profile-loaded", details });
				}
			}
			if (workerTab && context.stage === "companySearch") {
				const details = await stableDetails(
					() => companySearchResult(context.companyName),
					(value) =>
						Boolean(value.companyLinkedInUrl || value.companySearchAmbiguous),
				);
				const response = await send({
					type: "northgrain:company-search-resolved",
					companyLinkedInUrl: details.companyLinkedInUrl,
				});
				if (response?.extraction && response.companyUrl)
					location.assign(response.companyUrl);
			}
			if (workerTab && context.stage === "company") {
				const details = await stableDetails(companyWebsiteDetails, (value) =>
					Boolean(
						value.companyDomain && value.companyWebsiteSource === "details",
					),
				);
				await send({ type: "northgrain:company-loaded", details });
			}
		}
		if (workerTab) return;
		const response = await send({ type: "northgrain:queue-get" });
		queue = response?.queue ?? queue;
		mountUi();
		mountProfileAction();
	}

	void start().catch(() => undefined);
})();
