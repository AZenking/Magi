import pino, { type Logger as PinoInstance, type LoggerOptions as PinoOpts } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  context?: string;
  level?: LogLevel;
}

let rootLogger: PinoInstance | null = null;

function getRootLogger(): PinoInstance {
  if (rootLogger) return rootLogger;

  const isDev = process.env.NODE_ENV !== "production";
  const level = (process.env.LOG_LEVEL as LogLevel) ?? "info";

  const options: PinoOpts = {
    level,
    formatters: {
      bindings(bindings) {
        return { pid: bindings.pid, hostname: bindings.hostname };
      },
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDev) {
    rootLogger = pino({
      ...options,
      transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
    });
  } else {
    rootLogger = pino(options);
  }
  return rootLogger;
}

export class Logger {
  private pino: PinoInstance;
  private context: string;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context ?? "app";
    this.pino = getRootLogger().child({ context: this.context });
  }

  debug(message: string, meta?: unknown): void {
    this.pino.debug({ meta }, message);
  }

  info(message: string, meta?: unknown): void {
    this.pino.info({ meta }, message);
  }

  warn(message: string, meta?: unknown): void {
    this.pino.warn({ meta }, message);
  }

  error(message: string, meta?: unknown): void {
    this.pino.error({ meta }, message);
  }

  child(context: string): Logger {
    return new Logger({ context: `${this.context}:${context}` });
  }

  get pinoInstance(): PinoInstance {
    return this.pino;
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
