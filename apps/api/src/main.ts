import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, type NextFunction, type Request, type Response } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./infrastructure/auth/auth.config";

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const allowedOrigins = new Set(
  webOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function authCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "content-type, authorization",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    cors: {
      origin: webOrigin,
      credentials: true,
    },
  });

  app.useLogger(app.get(Logger));

  // Better Auth handler — must run before JSON body parser.
  app.use("/api/auth", authCors, toNodeHandler(auth));

  // JSON body parser for all other routes.
  app.use(json());

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
}
bootstrap();
