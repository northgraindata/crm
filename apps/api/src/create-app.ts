import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ContextLogger } from "./logging/context-logger";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);
	const origins = [process.env.APP_URL, process.env.EXTENSION_ORIGINS]
		.flatMap((value) => (value ?? "").split(","))
		.map((value) => value.trim())
		.filter(Boolean);
	app.enableCors({ origin: origins.length > 0 ? origins : false });

	app.use(helmet());
	app.use("/api/v1", express.json({ limit: "1mb" }));
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	return app;
}
