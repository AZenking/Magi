import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, static as serveStatic, type NextFunction, type Request, type Response } from "express";
import { Logger } from "nestjs-pino";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { OpenModule } from "./http/open/open.module";
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

  // Static file serving for uploaded logos.
  const uploadDir = process.env.LOGO_UPLOAD_DIR ?? "/app/uploads/logos";
  app.use("/uploads", serveStatic(uploadDir.split("/logos")[0] || uploadDir));

  // OpenAPI (005-open-channels-epg-api): code-first document served at
  // /api/docs (Swagger UI) and /api/open.json (machine-readable spec, US4).
  // Scope to OpenModule so only /api/open/v1/* is published to external
  // consumers — admin/internal routes stay out of the public contract.
  const swaggerDoc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Magi Open API")
      .setDescription("只读频道与节目单开放接口（需 access token，通过 Client Credentials Grant 获取）")
      .setVersion("1.0.0")
      .addBearerAuth({ type: "http", scheme: "bearer" }, "access-token")
      .build(),
    { include: [OpenModule] },
  );
  SwaggerModule.setup("api/docs", app, swaggerDoc, {
    swaggerOptions: { docExpansion: "none" },
    // Expose the raw spec at /api/open.json for client generation (US4/T039).
    customJs: undefined,
  });
  // Custom route for the raw OpenAPI JSON (Swagger UI serves /api/docs-json by
  // default; this alias matches the contract in quickstart.md).
  app.use("/api/open.json", (_req: Request, res: Response) => res.json(swaggerDoc));

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
}
bootstrap();
