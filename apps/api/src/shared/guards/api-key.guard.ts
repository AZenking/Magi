/**
 * ApiKeyGuard — Bearer/x-api-key authentication for the open API
 * (005-open-channels-epg-api, FR-007/FR-019).
 *
 * Physically isolated from AuthGuard (session cookie): this guard ONLY accepts
 * an API key and NEVER falls back to a session. The reverse also holds — admin
 * session cookies cannot reach /api/open/* (they carry no Bearer key).
 *
 * On success it attaches `req.apiKey` (id/name/keyPrefix only — never the hash)
 * and best-effort refreshes `lastUsedAt`.
 */
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { IApiKeyRepository } from "@/domain/api-key";
import type { RequestApiKey } from "../decorators/api-key.decorator";

export const API_KEY_REPOSITORY = "API_KEY_REPOSITORY";

/** SHA-256 hex of the plaintext key. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generate a new plaintext key: `magi_<32 base62>`. */
export function generateApiKeyPlaintext(): string {
  return `magi_${randomBytes(24).toString("base64url").slice(0, 32)}`;
}

/** Masked prefix for list display, e.g. `magi_3f9…`. */
export function maskKeyPrefix(plaintext: string): string {
  return `${plaintext.slice(0, 8)}…`;
}

function extractToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers.authorization ?? req.headers.Authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey.trim() || null;
  return null;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly repo: IApiKeyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedException({
        code: "api-key-required",
        title: "API key required",
        status: 401,
      });
    }

    // findActiveByHash already filters status=active AND not expired, so a
    // single lookup resolves existence + usability. All failure modes
    // (missing / disabled / revoked / expired) collapse to one code to avoid
    // key enumeration (data-model.md edge cases).
    const key = await this.repo.findActiveByHash(hashApiKey(token));
    if (!key) {
      throw new UnauthorizedException({
        code: "api-key-invalid",
        title: "API key invalid or inactive",
        status: 401,
      });
    }

    const safe: RequestApiKey = { id: key.id, name: key.name, keyPrefix: key.keyPrefix };
    req.apiKey = safe;

    // Best-effort lastUsedAt refresh — never block or fail the request on it.
    void this.repo.touchLastUsed(key.id).catch(() => {
      /* intentionally swallowed: usage tracking is non-critical */
    });

    return true;
  }
}
