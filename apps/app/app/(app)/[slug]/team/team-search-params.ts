import { createListSearchParams } from "@/components/data-table/list-search-params";

export const teamSearchParams = createListSearchParams({
	defaultSort: "name",
	defaultDir: "asc",
	facetIds: ["status", "employmentType"] as const,
});
