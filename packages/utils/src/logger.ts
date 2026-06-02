export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  context?: string;
  level?: LogLevel;
}

export class Logger {
  private context: string;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context ?? "app";
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString();
    const payload = { timestamp, level, context: this.context, message, meta };
    const output = JSON.stringify(payload);
    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, meta?: unknown) { this.log("debug", message, meta); }
  info(message: string, meta?: unknown) { this.log("info", message, meta); }
  warn(message: string, meta?: unknown) { this.log("warn", message, meta); }
  error(message: string, meta?: unknown) { this.log("error", message, meta); }

  child(context: string): Logger {
    return new Logger({ context: `${this.context}:${context}` });
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
