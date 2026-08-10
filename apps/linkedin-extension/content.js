(() => {
	const api = globalThis.browser ?? globalThis.chrome;
	const PROFILE_PATH = /^\/in\/[^/]+/;
	const BUTTON_HOST_ID = "northgrain-profile-action";
	const MODAL_HOST_ID = "northgrain-confirmation";
	const PROFILE_ACTION =
		/message|connect|follow|wiadomość|wiadomosc|połącz|polacz|obserwuj|mensaje|conectar|seguir|nachricht|vernetzen|folgen|messaggio|collegati|segui|mensagem|conectar|seguir/i;
	let restoreFocus = null;
	let inertState = [];

	const clean = (value) => value?.replace(/\s+/g, " ").trim() ?? "";

	function personName(value) {
		const parts = clean(value).split(" ").filter(Boolean);
		return { firstName: parts.shift() ?? "", lastName: parts.join(" ") };
	}

	function canonicalProfileUrl(value) {
		try {
			const url = new URL(value, location.origin);
			const match = /^\/in\/([^/]+)/.exec(url.pathname);
			return match ? `https://www.linkedin.com/in/${match[1]}` : "";
		} catch {
			return "";
		}
	}

	function visibleText(element) {
		return element instanceof HTMLElement && element.offsetParent !== null
			? clean(element.textContent)
			: "";
	}

	function safeExtractText(selector, fallback = "") {
		return (
			[...document.querySelectorAll(selector)]
				.map((element) => clean(element.textContent))
				.find(Boolean) ?? fallback
		);
	}

	function isPersonName(value) {
		const words = clean(value).split(" ").filter(Boolean);
		return (
			words.length >= 2 &&
			words.length <= 4 &&
			words.every((word) => /^[\p{L}'’-]+$/u.test(word)) &&
			!/powiadomień|powiadomien|notifications|people|osoby/i.test(value)
		);
	}

	function profileHeading() {
		return [
			...document.querySelectorAll(
				"[data-anonymize='person-name'], .pv-text-details__left-panel h1, main h1, main h2",
			),
		].find((element) => isPersonName(visibleText(element)));
	}

	function profileName() {
		const heading =
			safeExtractText("main h2") ||
			safeExtractText("main h1") ||
			[...document.querySelectorAll("h2")]
				.map((element) => clean(element.textContent))
				.find(
					(value) =>
						value.split(/\s+/).length > 1 &&
						!/powiadomień|powiadomien|notifications/i.test(value),
				);
		if (heading) return heading;

		const metadata = [
			document
				.querySelector("meta[property='og:title']")
				?.getAttribute("content"),
			document
				.querySelector("meta[name='description']")
				?.getAttribute("content"),
		]
			.map(clean)
			.find(Boolean);
		if (metadata) {
			return metadata
				.replace(/(?:'s|’s) profile.*$/i, "")
				.replace(/\s*[-|].*LinkedIn.*$/i, "");
		}

		const slug = /^\/in\/([^/]+)/.exec(location.pathname)?.[1];
		return clean(slug?.replace(/-\d+$/, "").replace(/[-_]+/g, " "));
	}

	function profileSection() {
		const heading = profileHeading();
		const topCard = [
			...document.querySelectorAll('section[componentkey$="Topcard"]'),
		].find((section) => section.contains(heading));
		return (
			topCard ??
			heading?.closest("section") ??
			heading?.parentElement?.parentElement ??
			document.querySelector("main")
		);
	}

	function profileLines(section) {
		return (section?.innerText ?? "").split(/\n+/).map(clean).filter(Boolean);
	}

	function uniqueLines(elements) {
		return [...elements]
			.map(visibleText)
			.filter((line, index, lines) => line && lines.indexOf(line) === index);
	}

	function isProfileMetadata(line) {
		return (
			/^·?\s*(?:1st|2nd|3rd)\s*$/i.test(line) ||
			line === "·" ||
			/^(?:contact info|informacje kontaktowe)$/i.test(line) ||
			/^\d[\d,.\s]*\+?\s*(?:followers?|connections?|obserwujących|kontaktów)$/i.test(
				line,
			) ||
			/\bmutual connection\b|\bwspóln(?:y|a) kontakt\b/i.test(line) ||
			/^profile enhanced with premium$/i.test(line)
		);
	}

	function topCardLines(section) {
		return uniqueLines(section?.querySelectorAll("p") ?? []).filter(
			(line) => !isProfileMetadata(line),
		);
	}

	function profileHeadline(section) {
		return topCardLines(section)[0] ?? "";
	}

	function currentExperience() {
		const anchor = document.querySelector(
			"[id*='ExperienceTopLevelSection'], #experience",
		);
		const section = anchor?.closest("section") ?? anchor;
		const details = [
			...(section?.querySelectorAll("a > div > div > div") ?? []),
		].find((element) => element.querySelectorAll(":scope > p").length >= 2);
		const detailsLines = [...(details?.querySelectorAll(":scope > p") ?? [])]
			.map((element) => clean(element.textContent))
			.filter(Boolean);
		const item = section?.querySelector("li");
		const itemLines = [
			...(item?.querySelectorAll('span[aria-hidden="true"]') ?? []),
		]
			.map(visibleText)
			.filter((line, index, lines) => line && lines.indexOf(line) === index);
		const lines = detailsLines.length >= 2 ? detailsLines : itemLines;
		return {
			title: lines[0] ?? "",
			companyName: clean(lines[1]?.split(/\s*\u00b7\s*/)[0]),
		};
	}

	function profileCompany(section, experience, headline) {
		const companyControl = section
			?.querySelector('svg[id^="company-accent-"]')
			?.closest('[role="button"], a, button');
		const companyFromControl = clean(companyControl?.innerText)
			.split(/\n+/)
			.map(clean)
			.find(Boolean);
		const labelledCompany = section?.querySelector(
			'[aria-label^="current company:" i], [aria-label^="company:" i]',
		);
		const companyFromLabel = clean(labelledCompany?.getAttribute("aria-label"))
			.replace(/^(?:current company|company):\s*/i, "")
			.split(/\.\s*(?:click|select|kliknij)\b/i)[0];
		const lines = topCardLines(section);
		const summary = lines.find(
			(line) =>
				line !== headline &&
				line.includes("·") &&
				(!companyFromControl || line.startsWith(companyFromControl)),
		);
		const companyFromSummary = clean(summary?.split(/\s*·\s*/)[0]);
		const companyName =
			companyFromControl ||
			companyFromLabel ||
			companyFromSummary ||
			experience.companyName;
		const companyLink = [
			...(companyControl?.matches('a[href*="/company/"]')
				? [companyControl]
				: []),
			...(companyControl?.querySelectorAll('a[href*="/company/"]') ?? []),
			...(section?.querySelectorAll('a[href*="/company/"]') ?? []),
		].find((link) => !companyName || visibleText(link) === companyName);
		return {
			name: companyName,
			linkedinUrl: companyLink?.href || undefined,
			summary,
		};
	}

	function profileLocation(section, companySummary) {
		if (!companySummary) return "";
		const lines = topCardLines(section);
		const index = lines.indexOf(companySummary);
		return index < 0 ? "" : (lines[index + 1] ?? "");
	}

	function profileTitle() {
		const section = profileSection();
		const headline = profileHeadline(section);
		if (headline) return clean(headline.split(/\s*[|｜]\s*/)[0]);

		const experience = currentExperience();
		return experience.title;
	}

	function profileEmail(section) {
		const link = [
			...(section?.querySelectorAll('a[href^="mailto:"]') ?? []),
			...document.querySelectorAll('a[href^="mailto:"]'),
		].find((element) => element instanceof HTMLAnchorElement);
		const linkedEmail = clean(
			link?.getAttribute("href")?.replace(/^mailto:/i, ""),
		);
		if (linkedEmail) return linkedEmail;
		return (
			profileLines(section)
				.join(" ")
				.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? ""
		);
	}

	function profileDetails() {
		const section = profileSection();
		const nameText = profileName();
		const name = personName(nameText);
		const headline = profileHeadline(section);
		const title = profileTitle();
		const experience = currentExperience();
		const company = profileCompany(section, experience, headline);
		const image = section?.querySelector(
			'[componentkey="topcard-logo-image-referencekey"] img, [aria-label="Profile photo"] img, img.pv-top-card-profile-picture__image, img[alt*="profile photo" i]',
		);
		return {
			profileUrl: canonicalProfileUrl(location.href),
			...name,
			title,
			headline: headline || undefined,
			location: profileLocation(section, company.summary) || undefined,
			companyName: company.name,
			companyLinkedInUrl: company.linkedinUrl,
			email: profileEmail(section) || undefined,
			imageUrl: image?.currentSrc || image?.src || undefined,
			reason: "Potential client",
			inbound: false,
			connectionStatus: "unknown",
			createFollowUp: false,
		};
	}

	function invitationDetails(button) {
		const card =
			button.closest('[data-view-name*="invitation"]') ??
			button.closest('[role="listitem"][componentkey^="urn:li:invitation:"]') ??
			button.closest('[role="listitem"]') ??
			button.closest("li") ??
			button.parentElement?.parentElement;
		const profileLinks = [
			...(card?.querySelectorAll('a[href*="/in/"]') ?? []),
		].filter((link) => canonicalProfileUrl(link.href));
		const namedProfile = profileLinks
			.map((link) => ({
				link,
				name: [
					visibleText(link.querySelector("strong")),
					visibleText(link.querySelector('span[aria-hidden="true"]')),
					visibleText(link),
				]
					.map((value) => clean(value).replace(/\s+wants to connect$/i, ""))
					.find(isPersonName),
			}))
			.find((entry) => entry.name);
		const profileLink = namedProfile?.link ?? profileLinks[0];
		const visibleName = namedProfile?.name ?? "";
		const labelledName = clean(profileLink?.getAttribute("aria-label"))
			.replace(/^View\s+/i, "")
			.replace(/(?:’s|'s) profile$/i, "");
		const nameText = visibleName || labelledName;
		const name = personName(nameText.replace(/^View\s+/i, ""));
		const lines = uniqueLines(card?.querySelectorAll("p") ?? []);
		const headline = lines.find(
			(line) =>
				line !== nameText &&
				!line.includes(nameText) &&
				!/accept|ignore|mutual|connection|wants to connect/i.test(line),
		);
		const image = card?.querySelector('a[href*="/in/"] img');
		return {
			profileUrl: canonicalProfileUrl(profileLink?.href ?? ""),
			...name,
			title: clean(headline?.split(/\s*[|｜]\s*/)[0]),
			headline: headline || undefined,
			imageUrl: image?.currentSrc || image?.src || undefined,
			companyName: "",
			reason: "Relationship",
			inbound: true,
			connectionStatus: "connected",
			connectedAt: new Date().toISOString(),
			createFollowUp: false,
		};
	}

	function sendCapture(payload) {
		return new Promise((resolve, reject) => {
			api.runtime.sendMessage(
				{ type: "northgrain:capture", payload },
				(response) => {
					if (api.runtime.lastError) {
						reject(new Error(api.runtime.lastError.message));
						return;
					}
					if (!response?.ok) {
						reject(
							new Error(
								response?.error ?? "Northgrain could not save this person.",
							),
						);
						return;
					}
					resolve(response.result);
				},
			);
		});
	}

	function modalStyles() {
		return `
			:host { all: initial; color-scheme: light; font-family: system-ui, sans-serif; }
			.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 0.38); }
			.dialog { box-sizing: border-box; width: min(520px, 100%); max-height: calc(100vh - 48px); overflow: auto; overscroll-behavior: contain; border-radius: 8px; padding: 24px; color: #1b1d1c; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.18); }
			h2 { margin: 0; font-size: 20px; line-height: 1.3; }
			.intro { margin: 6px 0 20px; color: #5b625f; font-size: 14px; line-height: 1.45; }
			.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
			.full { grid-column: 1 / -1; }
			label { display: grid; gap: 5px; color: #303633; font-size: 13px; font-weight: 650; }
			input, select, button { box-sizing: border-box; min-height: 40px; border-radius: 5px; font: inherit; }
			input, select { width: 100%; border: 1px solid #aeb6b2; padding: 8px 10px; color: #1b1d1c; background: #fff; }
			.check { display: flex; align-items: center; gap: 9px; min-height: 40px; font-weight: 500; }
			.check input { width: 18px; min-height: 18px; margin: 0; }
			.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
			button { border: 1px solid #c9cfcc; padding: 8px 16px; cursor: pointer; font-weight: 700; transition: opacity 100ms ease-out, scale 100ms ease-out; }
			button:hover { opacity: 0.92; }
			button:active { scale: 0.96; }
			.secondary { color: #303633; background: #fff; }
			.primary { border-color: #006b4f; color: #fff; background: #006b4f; }
			button:disabled { cursor: wait; opacity: 0.62; }
			input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #006b4f; outline-offset: 2px; }
			.status { min-height: 20px; margin: 14px 0 0; color: #47504c; font-size: 13px; line-height: 1.4; }
			@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .full { grid-column: auto; } .dialog { padding: 20px; } }
		`;
	}

	function closeModal() {
		document.getElementById(MODAL_HOST_ID)?.remove();
		for (const [element, wasInert] of inertState) element.inert = wasInert;
		inertState = [];
		restoreFocus?.focus();
		restoreFocus = null;
	}

	function openModal(details) {
		closeModal();
		restoreFocus = document.activeElement;
		const host = document.createElement("div");
		host.id = MODAL_HOST_ID;
		document.body.append(host);
		inertState = [...document.body.children]
			.filter((element) => element !== host)
			.map((element) => [element, element.inert]);
		for (const [element] of inertState) element.inert = true;
		const root = host.attachShadow({ mode: "closed" });
		root.innerHTML = `
			<style>${modalStyles()}</style>
			<div class="backdrop">
				<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="northgrain-title" aria-describedby="northgrain-description">
					<h2 id="northgrain-title">Add to Northgrain</h2>
					<p class="intro" id="northgrain-description">Review the details LinkedIn made visible before saving this person.</p>
					<form>
						<div class="grid">
							<label>First name<input name="firstName" autocomplete="given-name" required></label>
							<label>Last name<input name="lastName" autocomplete="family-name"></label>
							<label class="full">Title<input name="title" autocomplete="organization-title"></label>
							<label>Company<input name="companyName" autocomplete="organization"></label>
							<label>Company domain<input name="companyDomain" placeholder="example.com" inputmode="url"></label>
							<label class="full">Relationship<select name="reason"><option>Potential client</option><option>Partner</option><option>Recruiter</option><option>Relationship</option><option>Other</option></select></label>
							<label class="check full"><input name="createFollowUp" type="checkbox">Create a task to send a LinkedIn message</label>
						</div>
						<p class="status" role="status" aria-live="polite"></p>
						<div class="actions"><button class="secondary" type="button">Cancel</button><button class="primary" type="submit">Save person</button></div>
					</form>
				</section>
			</div>`;
		const form = root.querySelector("form");
		for (const name of [
			"firstName",
			"lastName",
			"title",
			"companyName",
			"companyDomain",
			"reason",
		]) {
			form.elements[name].value = details[name] ?? "";
		}
		form.elements.createFollowUp.checked = details.createFollowUp;
		root.querySelector(".secondary").addEventListener("click", closeModal);
		root.querySelector(".backdrop").addEventListener("click", (event) => {
			if (event.target === event.currentTarget) closeModal();
		});
		root.addEventListener("keydown", (event) => {
			if (event.key === "Escape") closeModal();
			if (event.key !== "Tab") return;
			const focusable = [
				...root.querySelectorAll("input, select, button"),
			].filter((element) => !element.disabled);
			const first = focusable[0];
			const last = focusable.at(-1);
			if (event.shiftKey && root.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && root.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		});
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const submit = root.querySelector(".primary");
			const status = root.querySelector(".status");
			submit.disabled = true;
			status.textContent = "Saving person…";
			const values = Object.fromEntries(new FormData(form));
			try {
				const result = await sendCapture({
					...details,
					...values,
					createFollowUp: form.elements.createFollowUp.checked,
				});
				status.textContent = result.taskId
					? "Person saved and follow-up task created."
					: "Person saved to Northgrain.";
				setTimeout(closeModal, 900);
			} catch (error) {
				status.textContent =
					error instanceof Error
						? error.message
						: "Northgrain could not save this person.";
				submit.disabled = false;
			}
		});
		form.elements.firstName.focus();
	}

	function profileActionRow() {
		const section = profileSection();
		const action = [...(section?.querySelectorAll("button, a") ?? [])].find(
			(element) => PROFILE_ACTION.test(visibleText(element)),
		);
		if (!action) return null;

		let row = action.parentElement;
		while (row && row !== section) {
			const controls = [...row.querySelectorAll("button, a")].filter(
				visibleText,
			);
			if (controls.length > 1) return row.parentElement ?? row;
			row = row.parentElement;
		}

		return action.parentElement;
	}

	function mountProfileAction() {
		const existing = document.getElementById(BUTTON_HOST_ID);
		if (!PROFILE_PATH.test(location.pathname)) {
			existing?.remove();
			return;
		}
		if (existing || !document.body) return;
		const row = profileActionRow();
		if (!row) return;
		const host = document.createElement("span");
		host.id = BUTTON_HOST_ID;
		host.style.cssText =
			"margin-inline-start:auto;display:inline-flex;flex-shrink:0;align-items:center;";
		const root = host.attachShadow({ mode: "closed" });
		root.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    button {
      height: 32px;
      min-height: 32px;
      padding: 0 12px;

      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;

      border: 1px solid #006b4f;
      border-radius: 16px;

      background: #006b4f;
      color: #fff;

      cursor: pointer;

      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;

      white-space: nowrap;

      transition:
        background-color 100ms ease-out,
        transform 100ms ease-out;
    }

    button:hover {
      background: #005c44;
    }

    button:active {
      transform: scale(0.96);
    }

    button:focus-visible {
      outline: 2px solid #006b4f;
      outline-offset: 2px;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .logo {
      width: 16px;
      height: 16px;
      display: block;
      flex-shrink: 0;
      object-fit: contain;
	  filter: invert(100%);
    }
  </style>

  <button
    type="button"
    aria-label="Add LinkedIn contact to Northgrain CRM"
    aria-live="polite"
  >
    <img
      class="logo"
      src="https://northgraindata.com/images/branding/northgrain-icon.svg"
      alt=""
    />
    <span>Add to CRM</span>
  </button>
`;
		const button = root.querySelector("button");
		button.addEventListener("click", async () => {
			const details = profileDetails();
			if (!details.profileUrl || !details.firstName) {
				button.textContent = "Could not read profile";
				return;
			}
			button.disabled = true;
			button.textContent = "Saving…";
			try {
				await sendCapture(details);
				button.textContent = "Added";
			} catch {
				button.disabled = false;
				button.textContent = "Retry";
			}
		});
		row.append(host);
	}

	function isAcceptButton(button) {
		const label = `${button.getAttribute("aria-label") ?? ""} ${visibleText(button)}`;
		return /\baccept\b|zaakceptuj|accepter|aceptar|annehmen|accetta|aceitar/i.test(
			label,
		);
	}

	document.addEventListener(
		"click",
		(event) => {
			const button =
				event.target instanceof Element ? event.target.closest("button") : null;
			if (!button || !isAcceptButton(button)) return;
			const details = invitationDetails(button);
			if (!details.profileUrl || !details.firstName) return;
			setTimeout(() => openModal(details), 0);
		},
		true,
	);

	let scheduled = false;
	const observer = new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			mountProfileAction();
		}, 150);
	});
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
	mountProfileAction();
	window.addEventListener("load", mountProfileAction);
	setTimeout(mountProfileAction, 500);
	setTimeout(mountProfileAction, 1500);
})();
