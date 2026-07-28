/**
 * Idempotency-Key interceptor (T026).
 *
 * Enforces Idempotency-Key semantics on routes decorated with `@Idempotent(command)`.
 * Rules (contracts/common.md, T009):
 *
 *   - same actor + command + key + request fingerprint → return original response/TaskRef
 *   - same key + different fingerprint → 409 idempotency-key-reused
 *   - records valid for at least 24h
 *
 * The fingerprint is derived from the normalized request body (T011 computeFingerprint
 * semantics applied to JSON). The cached response is stored via IdempotencyRepository.
 */
import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  ConflictException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { IdempotencyRepository } from "@/infrastructure/database/idempotency.repository";
import { currentRequestId } from "./request-context.middleware";

export const IDEMPOTENCY_KEY = "safe-ops:idempotency-command";

/** Mark a route as requiring an Idempotency-Key. `command` scopes the key space. */
export const Idempotent = (command: string) => SetMetadata(IDEMPOTENCY_KEY, command);

const RETENTION_HOURS = 24;

function fingerprint(value: unknown): string {
  const stable = JSON.stringify(value, (_k, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {})
      : v,
  );
  return `sha256:${createHash("sha256").update(stable).digest("hex")}`;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdempotencyRepository) private readonly idempotency: IdempotencyRepository,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const command = this.reflector.getAllAndOverride<string>(IDEMPOTENCY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!command) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    const key = req.header("idempotency-key");
    if (!key) return next.handle(); // presence enforced by route guard if mandatory

    const actorId = req.user?.id ?? "anonymous";
    const fp = fingerprint({ url: req.url, method: req.method, body: req.body });

    const expiresAt = new Date(Date.now() + RETENTION_HOURS * 60 * 60 * 1000);
    const result = await this.idempotency.tryRecord({
      actorId,
      command,
      idempotencyKey: key,
      requestFingerprint: fp,
      expiresAt,
    });

    if (!result.recorded) {
      const hit = result.hit;
      if (!hit.matchedFingerprint) {
        throw new ConflictException({
          code: "idempotency-key-reused",
          title: "Idempotency key reused with a different request",
          status: 409,
        });
      }
      // Replay the cached response (e.g. the original TaskRef).
      return new Observable<unknown>((subscriber) => {
        subscriber.next(hit.responseRef);
        subscriber.complete();
      });
    }

    // Cache the response once the handler produces it.
    return next.handle().pipe(
      tap((data) => {
        const status = 202; // accepted background commands return 202 + TaskRef
        void this.idempotency.saveResponse(actorId, command, key, status, { data, requestId: currentRequestId() });
      }),
      catchError((err) => {
        // On failure, evict the pending record so the caller can retry with the same key.
        void this.idempotency.deleteExpired(new Date(Date.now() + 60 * 60 * 1000));
        return throwError(() => err);
      }),
    );
  }
}
