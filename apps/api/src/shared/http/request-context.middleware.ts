/**
 * Request-context middleware (T026).
 *
 * Generates (or accepts) `x-request-id` on every request and exposes it via
 * `req.requestId` + AsyncLocalStorage so logs, audit events and BullMQ jobs can
 * carry the same trace ID across the API → Worker boundary (constitution VII).
 */
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const storage = new AsyncLocalStorage<{ requestId: string }>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && /^[A-Za-z0-9_-]{1,120}$/.test(incoming) ? incoming : randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    storage.run({ requestId }, () => next());
  }
}
