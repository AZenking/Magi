/**
 * AccessTokenGuard — Bearer authentication for the open API
 * (004-safe-operations, replaces ApiKeyGuard).
 *
 * Validates a stateful access token issued by POST /api/open/v1/auth/token.
 * The token hash is looked up in oauth_access_tokens (must be non-revoked AND
 * not expired). On success attaches `req.client` with the public clientId +
 * name for attribution. Physically isolated from AuthGuard (session cookie),
 * exactly like the former ApiKeyGuard.
 */
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hashSecret } from "../crypto/secret-utils";
import { ACCESS_TOKEN_REPOSITORY } from "@/domain/oauth";

/** Shape attached to req.client on successful authentication. */
export interface RequestClient {
  /** oauth_clients.id (internal uuid). */
  id: string;
  /** Public client identifier, e.g. "magi_tv_android". */
  clientId: string;
  clientName: string;
}

function extractToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers.authorization ?? req.headers.Authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKEN_REPOSITORY) private readonly tokenRepo: import("@/domain/oauth").IAccessTokenRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedException({
        code: "access-token-required",
        title: "Access token required",
        status: 401,
      });
    }

    // Single join resolves token validity + client attribution.
    const result = await this.tokenRepo.findActiveByHashWithClient(hashSecret(token));
    if (!result) {
      // All failure modes (missing / revoked / expired) collapse to one code
      // to prevent token enumeration — same approach as the former ApiKeyGuard.
      throw new UnauthorizedException({
        code: "access-token-invalid",
        title: "Access token invalid or expired",
        status: 401,
      });
    }

    const safe: RequestClient = {
      id: result.token.clientId,
      clientId: result.clientId,
      clientName: result.clientName,
    };
    req.client = safe;

    // Best-effort lastUsedAt refresh — never block or fail the request on it.
    void this.tokenRepo.touchClientLastUsed(result.token.id).catch(() => {
      /* intentionally swallowed: usage tracking is non-critical */
    });

    return true;
  }
}
