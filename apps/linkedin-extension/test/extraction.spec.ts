import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const extensionRoot = join(import.meta.dir, "..");
const sharedSource = await readFile(join(extensionRoot, "shared.js"), "utf8");
const contentSource = await readFile(join(extensionRoot, "content.js"), "utf8");

async function page(fixture: string, href: string) {
	const html = await readFile(
		join(import.meta.dir, "fixtures", fixture),
		"utf8",
	);
	const { window } = parseHTML(html);
	const context = vm.createContext({
		document: window.document,
		HTMLElement: window.HTMLElement,
		HTMLAnchorElement: window.HTMLAnchorElement,
		Element: window.Element,
		MutationObserver: window.MutationObserver,
		FormData: window.FormData,
		URL,
		location: new URL(href),
		crypto,
		setTimeout: () => 1,
		clearTimeout: () => undefined,
		getComputedStyle: () => ({ display: "block", visibility: "visible" }),
		chrome: {
			runtime: {
				getManifest: () => ({ version: "1.4.0" }),
				lastError: undefined,
				sendMessage: (
					message: { type: string },
					callback: (response: unknown) => void,
				) =>
					callback(
						message.type === "northgrain:queue-get"
							? { queue: { items: [], paused: false } }
							: { ok: true, extraction: false },
					),
				onMessage: { addListener: () => undefined },
			},
		},
	});
	vm.runInContext(sharedSource, context);
	vm.runInContext(contentSource, context);
	return context as typeof context & {
		chrome: {
			runtime: {
				sendMessage(
					message: unknown,
					callback: (response: unknown) => void,
				): void;
			};
		};
		Northgrain: {
			extractProfile(): Record<string, unknown>;
			extractInvitation(button: Element): Record<string, unknown>;
			extractCompanyWebsite(): Record<string, unknown>;
			hasCompanyNavigationControl(): boolean;
			extractCompanySearchResult(companyName: string): Record<string, unknown>;
		};
		document: Document;
	};
}

describe("LinkedIn extraction fixtures", () => {
	it("extracts the current profile layout without generated CSS classes", async () => {
		const context = await page(
			"profile.html",
			"https://www.linkedin.com/in/axellb/",
		);
		expect(context.Northgrain.extractProfile()).toMatchObject({
			profileUrl: "https://www.linkedin.com/in/axellb",
			firstName: "Axel",
			lastName: "B.",
			title: "Data Director",
			headline: "Data Director @CHANEL - Watch and Fine Jewelry | ex-Tinyclues",
			location: "United Kingdom",
			companyName: "CHANEL",
			companyLinkedInUrl: "https://www.linkedin.com/company/162993/",
			imageUrl: "https://media.licdn.com/axel.jpg",
		});
	});

	it("prefers grouped current experience over a school in the top card", async () => {
		const context = await page(
			"profile-grouped-experience.html",
			"https://www.linkedin.com/in/rasool-a-3758a429/details/experience/",
		);

		expect(context.Northgrain.extractProfile()).toMatchObject({
			firstName: "Rasool",
			lastName: "Aghdam, Ph.D.",
			title: "Head of Commercial Data Analysis & Science",
			companyName: "Coca-Cola Bottlers Japan Inc.",
			companyLinkedInUrl:
				"https://www.linkedin.com/company/coca-cola-bottlers-japan-inc/",
		});
	});

	it("does not take a linked former employer when the current company is unlinked", async () => {
		const context = await page(
			"profile-current-unlinked-company.html",
			"https://www.linkedin.com/in/drakedoherty/details/experience/",
		);

		expect(context.Northgrain.extractProfile()).toMatchObject({
			firstName: "Drake",
			lastName: "Doherty",
			title: "Enterprise Account Executive",
			companyName: "dbt Labs",
			companyLinkedInUrl: undefined,
		});
		expect(context.Northgrain.hasCompanyNavigationControl()).toBe(true);
	});

	it("recognizes a Polish current-position marker", async () => {
		const context = await page(
			"profile-current-unlinked-company-pl.html",
			"https://www.linkedin.com/in/michalkrzyzanowski/details/experience/",
		);

		expect(context.Northgrain.extractProfile()).toMatchObject({
			firstName: "Michał",
			lastName: "Krzyżanowski",
			companyName: "KUBO",
			companyLinkedInUrl: undefined,
		});
		expect(context.Northgrain.hasCompanyNavigationControl()).toBe(true);
	});

	it("extracts a company website and normalized domain", async () => {
		const context = await page(
			"company.html",
			"https://www.linkedin.com/company/chanel/about/",
		);
		expect(context.Northgrain.extractCompanyWebsite()).toEqual({
			companyName: "CHANEL",
			companyWebsite: "https://www.slalom.com/",
			companyDomain: "slalom.com",
			companyWebsiteSource: "details",
		});
	});

	it("recognizes a JavaScript company button when LinkedIn exposes no URL", async () => {
		const context = await page(
			"profile.html",
			"https://www.linkedin.com/in/axellb/",
		);
		for (const link of context.document.querySelectorAll(
			'a[href*="/company/"]',
		)) {
			link.removeAttribute("href");
		}
		const logo = context.document.querySelector('svg[id^="company-accent-"]');
		const control = logo?.closest("a");
		if (!control) throw new Error("Fixture company control is missing.");
		const button = context.document.createElement("button");
		button.type = "button";
		button.innerHTML = control.innerHTML;
		control.replaceWith(button);

		expect(context.Northgrain.extractProfile()).toMatchObject({
			companyName: "CHANEL",
			companyLinkedInUrl: undefined,
		});
		expect(context.Northgrain.hasCompanyNavigationControl()).toBe(true);
	});

	it("selects an exact company from LinkedIn company search", async () => {
		const context = await page(
			"company.html",
			"https://www.linkedin.com/search/results/companies/?keywords=EPAM%20Systems",
		);
		const main = context.document.querySelector("main");
		if (!main) throw new Error("Fixture main element is missing.");
		main.innerHTML = `
			<a href="https://www.linkedin.com/company/epam-anywhere/">EPAM Anywhere Consulting</a>
			<a href="https://www.linkedin.com/company/epam-systems/">EPAM Systems</a>`;

		expect(
			context.Northgrain.extractCompanySearchResult("EPAM Systems"),
		).toEqual({
			companyLinkedInUrl:
				"https://www.linkedin.com/company/epam-systems/about/",
		});
	});

	it("does not guess between exact same-name LinkedIn companies", async () => {
		const context = await page(
			"company.html",
			"https://www.linkedin.com/search/results/companies/?keywords=Graphene",
		);
		const main = context.document.querySelector("main");
		if (!main) throw new Error("Fixture main element is missing.");
		main.innerHTML = `
			<a href="https://www.linkedin.com/company/graphene-consulting/">Graphene</a>
			<a href="https://www.linkedin.com/company/graphene-data/">Graphene</a>`;

		expect(context.Northgrain.extractCompanySearchResult("Graphene")).toEqual({
			companyLinkedInUrl: undefined,
			companySearchAmbiguous: true,
		});
	});

	it("ignores Visit website outside the company About Website field", async () => {
		const context = await page(
			"company.html",
			"https://www.linkedin.com/company/slalom/about/",
		);
		context.document.querySelector("dl")?.remove();

		expect(context.Northgrain.extractCompanyWebsite()).toEqual({});
	});

	it("captures invitation details before LinkedIn removes the card", async () => {
		const context = await page(
			"invitations.html",
			"https://www.linkedin.com/mynetwork/grow/",
		);
		const button = context.document.querySelector("button");
		if (!button) throw new Error("Fixture accept button is missing.");
		const details = context.Northgrain.extractInvitation(button);
		button.closest("li")?.remove();
		expect(details).toMatchObject({
			profileUrl: "https://www.linkedin.com/in/amitkhanna-dataspecialist",
			firstName: "Amit",
			lastName: "Khanna",
			headline: "Enterprise Data & AI Architect | GenAI & Data Modernization",
			inbound: true,
			connectionStatus: "connected",
			createFollowUp: true,
		});
	});

	it("persists an invitation before forwarding the accept click", async () => {
		const context = await page(
			"invitations.html",
			"https://www.linkedin.com/mynetwork/grow/",
		);
		const button = context.document.querySelector("button");
		if (!button) throw new Error("Fixture accept button is missing.");
		const order: string[] = [];
		context.chrome.runtime.sendMessage = (
			message: { type?: string },
			callback: (response: unknown) => void,
		) => {
			if (message.type === "northgrain:queue-add") order.push("persisted");
			callback({ ok: true });
		};
		context.document.addEventListener("click", (event) => {
			if (event.target === button) order.push("accepted");
		});

		button.click();
		await Promise.resolve();

		expect(order).toEqual(["persisted", "accepted"]);
	});
});
