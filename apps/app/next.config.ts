import { loadRootEnv } from "@crm/env";
import type { NextConfig } from "next";

loadRootEnv();

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

const publicApiUrl =
	process.env.NEXT_PUBLIC_API_URL ?? process.env.APP_URL ?? apiUrl;

const allowedDevOrigins = (process.env.APP_URL ?? "")
	.split(",")
	.flatMap((origin) => {
		try {
			return [new URL(origin.trim()).hostname];
		} catch {
			return [];
		}
	});

const nextConfig: NextConfig = {
	allowedDevOrigins,
	experimental: {
		serverActions: {
			bodySizeLimit: "12mb",
		},
	},

	env: {
		NEXT_PUBLIC_API_URL: publicApiUrl,
	},

	transpilePackages: ["@crm/auth", "@crm/db", "@crm/telemetry", "@crm/ui"],

	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "**.blob.vercel-storage.com" },
		],
	},

	cacheComponents: true,
	partialPrefetching: true,
};

export default nextConfig;
