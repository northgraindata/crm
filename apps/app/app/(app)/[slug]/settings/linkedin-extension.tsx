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
					Save LinkedIn profiles to Northgrain with a manual confirmation before
					creating a contact or follow-up.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<Button asChild>
						<a href="/downloads/northgrain-linkedin-extension.zip" download>
							Download extension
						</a>
					</Button>
					<span className="text-muted-foreground text-sm">
						Configured for this CRM workspace
					</span>
				</div>
				<div className="flex flex-col gap-2 text-sm">
					<p className="font-medium">Chrome</p>
					<p className="text-muted-foreground">
						Unzip the download, open chrome://extensions, enable Developer mode,
						and choose Load unpacked.
					</p>
					<p className="font-medium">Safari</p>
					<p className="text-muted-foreground">
						Unzip the download, create a Safari Web Extension target in Xcode,
						and select the extracted folder as its source.
					</p>
					<p className="text-muted-foreground text-xs">
						The package includes this CRM&apos;s public API URL. The extension
						stores your API token locally in the browser.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
