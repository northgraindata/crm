import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";

export function LinkedinExtension() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>LinkedIn extension</CardTitle>
				<CardDescription>
					Add LinkedIn profiles to CRM in one click.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<Button asChild>
						<a href="/extension-downloads/chrome" download>
							Download Chrome extension
						</a>
					</Button>
					<span className="text-muted-foreground text-sm">
						Configured for this CRM workspace
					</span>
				</div>
				<div className="flex flex-col gap-2 text-sm">
					<p className="font-medium">Chrome</p>
					<p className="text-muted-foreground">
						Unzip the Chrome package, open chrome://extensions, enable Developer
						mode, and choose Load unpacked. Reload the extension, refresh
						LinkedIn, then use Review in Northgrain on a profile.
					</p>
					<p className="text-muted-foreground text-xs">
						The package includes this CRM&apos;s public API URL. The extension
						stores your API token and capture queue locally in Chrome. Reload
						the unpacked extension when a new version is available; pending
						drafts remain available after an upgrade.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
