/**
 * AccessTokenGuard (T039).
 *
 * Verifies Bearer authentication for the open API: token extraction, hash
 * lookup, principal differentiation (device vs integration), unified failure
 * code (no enumeration leak), and best-effort lastUsed refresh that never
 * breaks the request.
 */
import { describe, it, expect, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { AccessTokenGuard } from "@/shared/guards/access-token.guard";
import type { IAccessTokenRepository } from "@/domain/oauth/access-token.repository";
import type { AccessToken } from "@/domain/oauth/access-token.model";
import { hashSecret } from "@/shared/crypto/secret-utils";

function makeContext(headers: Record<string, string>): ExecutionContext {
  const req: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

/** Build a complete AccessToken stub so the guard's typed return matches. */
function makeToken(overrides: Partial<AccessToken> = {}): AccessToken {
  return {
    id: "tok-1",
    clientId: "oauth-uuid-1",
    deviceClientId: null,
    grantType: "client_credentials",
    scope: "open:read",
    tokenHash: "hash",
    tokenPrefix: "magi",
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    revokedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRepo(
  result: Awaited<ReturnType<IAccessTokenRepository["findActiveByHashWithClient"]>> | null,
) {
  return {
    findActiveByHashWithClient: vi.fn().mockResolvedValue(result),
    touchClientLastUsed: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AccessTokenGuard", () => {
  it("rejects with access-token-required when no Bearer header is present", async () => {
    const repo = makeRepo(null);
    const guard = new AccessTokenGuard(repo as never);

    await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
      response: { code: "access-token-required", status: 401 },
    });
    expect(repo.findActiveByHashWithClient).not.toHaveBeenCalled();
  });

  it("rejects with access-token-required for a non-Bearer scheme", async () => {
    const repo = makeRepo(null);
    const guard = new AccessTokenGuard(repo as never);

    await expect(
      guard.canActivate(makeContext({ authorization: "Basic xyz" })),
    ).rejects.toMatchObject({
      response: { code: "access-token-required", status: 401 },
    });
  });

  it("hashes the token before lookup so the raw value never reaches the query", async () => {
    const repo = makeRepo(null);
    const guard = new AccessTokenGuard(repo as never);

    await expect(
      guard.canActivate(makeContext({ authorization: "Bearer my-secret-token" })),
    ).rejects.toMatchObject({ response: { code: "access-token-invalid" } });

    expect(repo.findActiveByHashWithClient).toHaveBeenCalledWith(
      hashSecret("my-secret-token"),
    );
    // Raw token must NOT be passed to the repository.
    expect(repo.findActiveByHashWithClient).not.toHaveBeenCalledWith(
      "my-secret-token",
    );
  });

  it("collapses missing / revoked / expired tokens into one access-token-invalid code", async () => {
    const repo = makeRepo(null);
    const guard = new AccessTokenGuard(repo as never);

    const err = await guard
      .canActivate(makeContext({ authorization: "Bearer gone" }))
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      response: { code: "access-token-invalid", status: 401 },
    });
  });

  it("attaches a device principal when the token binds to a device client", async () => {
    const repo = makeRepo({
      token: makeToken({
        id: "tok-1",
        clientId: "oauth-uuid-1",
        deviceClientId: "device-1",
        grantType: "device_code",
        scope: "client:heartbeat",
      }),
      clientId: "magi_tv_android",
      clientName: "Magi TV",
      deviceClientId: "device-1",
      ownerUserId: "user-1",
      scope: "client:heartbeat",
    });
    const guard = new AccessTokenGuard(repo as never);
    const ctx = makeContext({ authorization: "Bearer valid" });

    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);

    const req = ctx.switchToHttp().getRequest();
    expect(req.client).toEqual({
      id: "oauth-uuid-1",
      clientId: "magi_tv_android",
      clientName: "Magi TV",
    });
    expect(req.principal).toMatchObject({
      kind: "device",
      deviceClientId: "device-1",
      ownerUserId: "user-1",
      scope: "client:heartbeat",
    });
    expect(repo.touchClientLastUsed).toHaveBeenCalledWith("tok-1");
  });

  it("attaches an integration principal when the token has no device binding", async () => {
    const repo = makeRepo({
      token: makeToken({
        id: "tok-2",
        clientId: "oauth-uuid-2",
        deviceClientId: null,
        grantType: "client_credentials",
        scope: "open:read",
      }),
      clientId: "magi_web_admin",
      clientName: "Magi Web",
      deviceClientId: null,
      ownerUserId: null,
      scope: "open:read",
    });
    const guard = new AccessTokenGuard(repo as never);
    const ctx = makeContext({ authorization: "Bearer integ" });

    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest();
    expect(req.principal).toMatchObject({
      kind: "integration",
      clientId: "magi_web_admin",
      scope: "open:read",
    });
    expect(req.principal).not.toHaveProperty("deviceClientId");
  });

  it("still authenticates when the best-effort touchClientLastUsed rejects", async () => {
    const repo = makeRepo({
      token: makeToken({
        id: "tok-3",
        clientId: "oauth-uuid-3",
        deviceClientId: "device-2",
        grantType: "device_code",
        scope: "client:heartbeat",
      }),
      clientId: "magi_tv_android",
      clientName: "Magi TV",
      deviceClientId: "device-2",
      ownerUserId: "user-2",
      scope: "client:heartbeat",
    });
    repo.touchClientLastUsed.mockRejectedValueOnce(new Error("db down"));
    const guard = new AccessTokenGuard(repo as never);
    const ctx = makeContext({ authorization: "Bearer ok" });

    // Must NOT throw — usage tracking is non-critical.
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(repo.touchClientLastUsed).toHaveBeenCalledWith("tok-3");
  });

  it("defaults ownerUserId to empty string for a device token with null owner", async () => {
    const repo = makeRepo({
      token: makeToken({
        id: "tok-4",
        clientId: "oauth-uuid-4",
        deviceClientId: "device-3",
        grantType: "device_code",
        scope: "client:heartbeat",
      }),
      clientId: "magi_tv_android",
      clientName: "Magi TV",
      deviceClientId: "device-3",
      ownerUserId: null,
      scope: "client:heartbeat",
    });
    const guard = new AccessTokenGuard(repo as never);
    const ctx = makeContext({ authorization: "Bearer noowner" });

    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest();
    expect(req.principal).toMatchObject({
      kind: "device",
      ownerUserId: "",
      deviceClientId: "device-3",
    });
  });
});
