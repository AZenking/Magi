/**
 * ApiKeyGuard tests (T015, TDD — Red first).
 *
 * Guards the auth-isolation contract (FR-007/FR-019): missing/invalid/expired
 * keys collapse to one 401 code (no enumeration), valid keys pass, and a
 * session cookie WITHOUT a Bearer key is rejected (isolation from AuthGuard).
 */
import { describe, it, expect, vi } from "vitest";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ApiKeyGuard, hashApiKey } from "../api-key.guard";
import type { ApiKey, IApiKeyRepository } from "@/domain/api-key";

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "key-1",
    name: "test",
    keyHash: "hash",
    keyPrefix: "magi_abcd…",
    status: "active",
    expiresAt: null,
    scopes: null,
    lastUsedAt: null,
    createdBy: "admin",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeContext(headers: Record<string, string>): ExecutionContext {
  const req: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeRepo(foundKey: ApiKey | null): IApiKeyRepository {
  return {
    findActiveByHash: vi.fn(async () => foundKey),
    touchLastUsed: vi.fn(async () => {}),
    create: vi.fn(async () => makeKey()),
    findById: vi.fn(async () => null),
    findPaginated: vi.fn(async () => ({ items: [], total: 0 })),
    updateStatus: vi.fn(async () => null),
    deleteById: vi.fn(async () => true),
  };
}

describe("ApiKeyGuard", () => {
  it("missing Authorization + no x-api-key → 401 api-key-required", async () => {
    const guard = new ApiKeyGuard(makeRepo(null));
    await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
      response: { code: "api-key-required" },
    });
  });

  it("malformed Authorization (no Bearer prefix) → 401 api-key-required", async () => {
    const guard = new ApiKeyGuard(makeRepo(null));
    await expect(
      guard.canActivate(makeContext({ authorization: "magi_something" })),
    ).rejects.toMatchObject({ response: { code: "api-key-required" } });
  });

  it("invalid key → 401 api-key-invalid (repo returns null)", async () => {
    const guard = new ApiKeyGuard(makeRepo(null));
    await expect(
      guard.canActivate(makeContext({ authorization: "Bearer magi_wrong" })),
    ).rejects.toMatchObject({ response: { code: "api-key-invalid" } });
  });

  it("disabled/expired/revoked all collapse to api-key-invalid (findActiveByHash returns null)", async () => {
    // findActiveByHash filters status=active AND not expired server-side, so
    // every non-usable state yields null → single code. No enumeration.
    const guard = new ApiKeyGuard(makeRepo(null));
    for (const token of ["Bearer magi_disabled", "Bearer magi_revoked", "Bearer magi_expired"]) {
      await expect(
        guard.canActivate(makeContext({ authorization: token })),
      ).rejects.toMatchObject({ response: { code: "api-key-invalid" } });
    }
  });

  it("valid Bearer key → passes, attaches req.apiKey (no hash), refreshes lastUsedAt", async () => {
    const repo = makeRepo(makeKey({ id: "key-9", name: "客厅电视", keyPrefix: "magi_xy12…" }));
    const guard = new ApiKeyGuard(repo);
    const ctx = makeContext({ authorization: "Bearer magi_valid" });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    const req = ctx.switchToHttp().getRequest();
    expect(req.apiKey).toEqual({ id: "key-9", name: "客厅电视", keyPrefix: "magi_xy12…" });
    expect(req.apiKey).not.toHaveProperty("keyHash");
    expect(repo.findActiveByHash).toHaveBeenCalledWith(hashApiKey("magi_valid"));
    expect(repo.touchLastUsed).toHaveBeenCalledWith("key-9");
  });

  it("valid x-api-key header also accepted", async () => {
    const repo = makeRepo(makeKey());
    const guard = new ApiKeyGuard(repo);
    await expect(guard.canActivate(makeContext({ "x-api-key": "magi_valid" }))).resolves.toBe(true);
  });

  it("session cookie WITHOUT Bearer key is REJECTED (isolation from AuthGuard, FR-019)", async () => {
    const guard = new ApiKeyGuard(makeRepo(null));
    // A browser session cookie carries no Authorization/x-api-key → must fail.
    await expect(
      guard.canActivate(makeContext({ cookie: "better-auth=session-abc" })),
    ).rejects.toMatchObject({ response: { code: "api-key-required" } });
  });

  it("lastUsedAt refresh failure does NOT fail the request", async () => {
    const repo = makeRepo(makeKey());
    repo.touchLastUsed = vi.fn(async () => {
      throw new Error("db down");
    });
    const guard = new ApiKeyGuard(repo);
    // touchLastUsed is fire-and-forget (void .catch); the awaited canActivate resolves first.
    await expect(
      guard.canActivate(makeContext({ authorization: "Bearer magi_valid" })),
    ).resolves.toBe(true);
  });
});
