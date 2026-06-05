import { Module } from "@nestjs/common";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { randomUUID } from "crypto";

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
            : undefined,
        genReqId: () => randomUUID(),
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie"],
          censor: "[REDACTED]",
        },
        autoLogging: true,
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return "error";
          if (res.statusCode >= 400) return "warn";
          return "info";
        },
        serializers: {
          req(req) {
            return { method: req.method, url: req.url, id: req.id };
          },
          res(res) {
            return { statusCode: res.statusCode, responseTime: res.responseTime };
          },
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
