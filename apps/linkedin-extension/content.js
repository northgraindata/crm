(() => {
	const api = globalThis.browser ?? globalThis.chrome;
	const PROFILE_PATH = /^\/in\/[^/]+/;
	const BUTTON_HOST_ID = "northgrain-profile-action";
	const MODAL_HOST_ID = "northgrain-confirmation";
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

	function profileDetails() {
		const heading = [...document.querySelectorAll("main h1")].find(visibleText);
		const section =
			heading?.closest("section") ?? heading?.parentElement?.parentElement;
		const name = personName(visibleText(heading));
		const title = visibleText(
			section?.querySelector(
				".text-body-medium.break-words, [data-generated-suggestion-target] + div",
			),
		);
		const companyButton = section?.querySelector(
			'button[aria-label*="company" i], button[aria-label*="current" i]',
		);
		const companyName = clean(companyButton?.getAttribute("aria-label"))
			.replace(/^current company:\s*/i, "")
			.replace(/^company:\s*/i, "");
		return {
			profileUrl: canonicalProfileUrl(location.href),
			...name,
			title,
			companyName,
			reason: "Potential client",
			inbound: false,
			connectionStatus: "unknown",
			createFollowUp: false,
		};
	}

	function invitationDetails(button) {
		const card =
			button.closest('[data-view-name*="invitation"]') ??
			button.closest("li") ??
			button.parentElement?.parentElement;
		const profileLink = [
			...(card?.querySelectorAll('a[href*="/in/"]') ?? []),
		].find((link) => canonicalProfileUrl(link.href));
		const visibleName =
			visibleText(profileLink?.querySelector('span[aria-hidden="true"]')) ||
			visibleText(profileLink);
		const labelledName = clean(profileLink?.getAttribute("aria-label"))
			.replace(/^View\s+/i, "")
			.replace(/(?:’s|'s) profile$/i, "");
		const nameText = visibleName || labelledName;
		const name = personName(nameText.replace(/^View\s+/i, ""));
		const lines = (card?.innerText ?? "")
			.split(/\n+/)
			.map(clean)
			.filter(Boolean);
		const title = lines.find(
			(line) =>
				line !== nameText && !/accept|ignore|mutual|connection/i.test(line),
		);
		return {
			profileUrl: canonicalProfileUrl(profileLink?.href ?? ""),
			...name,
			title: title ?? "",
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

	function actionContainer() {
		const heading = [...document.querySelectorAll("main h1")].find(visibleText);
		const section =
			heading?.closest("section") ?? heading?.parentElement?.parentElement;
		const action = [...(section?.querySelectorAll("button, a") ?? [])].find(
			(element) => /message|connect|follow/i.test(visibleText(element)),
		);
		return action?.parentElement ?? null;
	}

	function mountProfileAction() {
		if (!PROFILE_PATH.test(location.pathname)) return;
		if (document.getElementById(BUTTON_HOST_ID)) return;
		const container = actionContainer();
		if (!container) return;
		const host = document.createElement("span");
		host.id = BUTTON_HOST_ID;
		host.style.display = "inline-flex";
		const root = host.attachShadow({ mode: "closed" });
		root.innerHTML = `
			<style>:host { display: inline-flex; } button { min-height: 40px; border: 1px solid #006b4f; border-radius: 20px; padding: 6px 16px; color: #fff; background: #006b4f; cursor: pointer; font: 600 14px/1 system-ui, sans-serif; transition: opacity 100ms ease-out, scale 100ms ease-out; } button:hover { opacity: 0.92; } button:active { scale: 0.96; } button:focus-visible { outline: 2px solid #006b4f; outline-offset: 2px; }</style>
			<button type="button">Add to Northgrain</button>`;
		root
			.querySelector("button")
			.addEventListener("click", () => openModal(profileDetails()));
		container.append(host);
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
})();
