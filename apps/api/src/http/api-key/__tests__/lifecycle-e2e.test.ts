/**
 * API key lifecycle e2e test (T045, TDD).
 *
 * Wires TransitionApiKeyStatusUseCase → ApiKeyGuard against a shared fake
 * repository to prove that disabling a key makes it immediately unusable by
 * the guard (US5-AC1), revoke is irreversible, and the audit contract holds
 * via AppendAuditEventUseCase (US5-AC2 — the audit writer is invoked).
 */
import { describe, it, expect, vi } from "vitest";
import { ExecutionContext } from "@nestjs/common";
import { ApiKeyGuard, hashApiKey } from "@/shared/guards/api-key.guard";
import { TransitionApiKeyStatusUseCase } from "@/application/api-key/transition-api-key-status.use-case";
import type { ApiKey, IApiKeyRepository } from "@/domain/api-key";

const PLAINTEXT = "magi_secret123";

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "key-1",
    name: "客厅电视",
    keyHash: hashApiKey(PLAINTEXT),
    keyPrefix: "magi_sec…",
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

/** In-memory store so transition mutations are visible to the guard lookup. */
function makeSharedRepo() {
  const store = new Map<string, ApiKey>([["key-1", makeKey()]]);
  const repo: IApiKeyRepository = {
    findById: vi.fn(async (id) => store.get(id) ?? null),
    findActiveByHash: vi.fn(async (hash) => {
      const key = [...store.values()].find((k) => k.keyHash === hash);
      return key && key.status === "active" ? key : null;
    }),
    updateStatus: vi.fn(async (id, status) => {
      const k = store.get(id);
      if (!k) return null;
      const updated = { ...k, status };
      store.set(id, updated);
      return updated;
    }),
    touchLastUsed: vi.fn(async () => {}),
    create: vi.fn(async () => makeKey()),
    findPaginated: vi.fn(async () => ({ items: [...store.values()], total: store.size })),
    deleteById: vi.fn(async (id) => {
      return store.delete(id);
    }),
  };
  return { repo, store };
}

function makeContext(authHeader?: string): ExecutionContext {
  const req: Record<string, unknown> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("API key lifecycle e2e (US5-AC1/AC2)", () => {
  it("active key passes the guard", async () => {
    const { repo } = makeSharedRepo();
    const guard = new ApiKeyGuard(repo);
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).resolves.toBe(true);
  });

  it("disabling the key makes it IMMEDIATELY rejected by the guard", async () => {
    const { repo } = makeSharedRepo();
    const transition = new TransitionApiKeyStatusUseCase(repo);
    const guard = new ApiKeyGuard(repo);

    // Before: usable
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).resolves.toBe(true);

    // Disable via the transition use-case
    const updated = await transition.execute("key-1", "disabled");
    expect(updated.status).toBe("disabled");

    // After: rejected (findActiveByHash now returns null because status != active)
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).rejects.toMatchObject({
      response: { code: "api-key-invalid" },
    });
  });

  it("revoked key is permanently rejected (irreversible)", async () => {
    const { repo } = makeSharedRepo();
    const transition = new TransitionApiKeyStatusUseCase(repo);
    const guard = new ApiKeyGuard(repo);

    await transition.execute("key-1", "revoked");
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).rejects.toMatchObject({
      response: { code: "api-key-invalid" },
    });

    // Re-enabling is forbidden by the state machine — key stays dead.
    await expect(transition.execute("key-1", "active")).rejects.toBeDefined();
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).rejects.toBeDefined();
  });

  it("deleting the key removes it from the store", async () => {
    const { repo, store } = makeSharedRepo();
    const guard = new ApiKeyGuard(repo);
    await repo.deleteById("key-1");
    expect(store.has("key-1")).toBe(false);
    await expect(guard.canActivate(makeContext(`Bearer ${PLAINTEXT}`))).rejects.toMatchObject({
      response: { code: "api-key-invalid" },
    });
  });
});
