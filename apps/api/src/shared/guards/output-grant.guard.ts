/**
 * OutputGrantGuard (009-m3u-control-plane T050).
 *
 * Auth guard for the public playlist endpoint. Validates the `grant` query
 * parameter against the persisted grant rows via constant-time hash lookup.
 *
 * Security properties:
 *   - Never logs the plaintext grant (sanitized before structured-log capture).
 *   - Same 401 shape for missing / malformed / revoked / expired to avoid
 *     leaking grant existence.
 *   - Touches `lastUsedAt` on successful auth (best-effort; race-safe).
 *   - No shared Cache-Control: every response is private to the grant holder.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { OutputGrantRepository } from "@/infrastructure/database/output-grant.repository";
import { GRANT_TOKEN_PREFIX } from "@/application/output-composition/output-grant.use-cases";

@Injectable()
export class OutputGrantGuard implements CanActivate {
  constructor(private readonly repo: OutputGrantRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const grant = req?.query?.grant;
    if (typeof grant !== "string" || !isPlausibleGrantToken(grant)) {
      // Don't disclose whether the grant exists; uniform 401.
      throw new UnauthorizedException();
    }

    // Hash + lookup.
    const tokenHash = hashGrant(grant);
    const found = await this.repo.findByTokenHash(tokenHash);
    if (!found || found.status !== "active") {
      throw new UnauthorizedException();
    }
    if (found.expiresAt && new Date(found.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    // Strip the secret from the request URL so any downstream logger that
    // echoes `req.url` cannot leak it.
    if (typeof req.url === "string" && req.url.includes("grant=")) {
      req.url = req.url.replace(/grant=[^&]+/, "grant=<redacted>");
    }
    if (req.query && typeof req.query === "object") {
      // Replace the value rather than delete so the key stays available for
      // telemetry (we just no longer carry the secret).
      req.query.grant = "<redacted>";
    }

    // Attach the grant to the request for the controller.
    req.outputGrant = found;

    // Best-effort last-used touch.
    void this.repo.touchLastUsed(found.id, new Date()).catch(() => {
      // Ignore — lastUsedAt is informational, not authoritative.
    });

    // Force private caching for any proxy in front of the API.
    if (res && typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "private, max-age=15");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    return true;
  }
}

/** Fast pre-check before we hit the DB: must have the right prefix + min length. */
function isPlausibleGrantToken(raw: string): boolean {
  return (
    raw.startsWith(GRANT_TOKEN_PREFIX) &&
    raw.length >= GRANT_TOKEN_PREFIX.length + 12
  );
}

function hashGrant(plaintext: string): string {
  // Mirrors NodeOutputGrantCrypto.hash so the lookup matches the persisted row.
  return "sha256:" + createHash("sha256").update(plaintext).digest("hex");
}
