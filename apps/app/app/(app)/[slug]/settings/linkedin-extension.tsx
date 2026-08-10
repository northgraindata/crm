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
					<Button asChild variant="outline">
						<a href="/extension-downloads/safari" download>
							Download Safari extension
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
						LinkedIn, then use Add to CRM on a profile.
					</p>
					<p className="font-medium">Safari</p>
					<p className="text-muted-foreground">
						Unzip the Safari package, create a Safari Web Extension target in
						Xcode, and select the extracted folder as its source. Safari
						requires the Xcode wrapper before it can be installed in Safari.
					</p>
					<p className="text-muted-foreground text-xs">
						The package includes this CRM&apos;s public API URL. The extension
						stores your API token locally in the browser. Accepting a LinkedIn
						invitation also opens a confirmation with an optional message
						follow-up task.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
