/**
 * TransitionApiKeyStatusUseCase tests (T044, TDD).
 *
 * Guards the status machine at the use-case layer (data-model.md):
 * active⇄disabled legal, revoked terminal, illegal transitions → 409.
 */
import { describe, it, expect, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { TransitionApiKeyStatusUseCase } from "../transition-api-key-status.use-case";
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

function makeRepo(findByIdKey: ApiKey | null, updateResult: ApiKey | null): IApiKeyRepository {
  return {
    findById: vi.fn(async () => findByIdKey),
    updateStatus: vi.fn(async (_id, status) =>
      updateResult ? { ...updateResult, status } : null,
    ),
    create: vi.fn(async () => makeKey()),
    findActiveByHash: vi.fn(async () => null),
    findPaginated: vi.fn(async () => ({ items: [], total: 0 })),
    touchLastUsed: vi.fn(async () => {}),
    deleteById: vi.fn(async () => true),
  };
}

describe("TransitionApiKeyStatusUseCase", () => {
  it("active → disabled succeeds", async () => {
    const repo = makeRepo(makeKey({ status: "active" }), makeKey({ status: "disabled" }));
    const uc = new TransitionApiKeyStatusUseCase(repo);
    const result = await uc.execute("key-1", "disabled");
    expect(result.status).toBe("disabled");
    expect(repo.updateStatus).toHaveBeenCalledWith("key-1", "disabled");
  });

  it("disabled → active succeeds", async () => {
    const repo = makeRepo(makeKey({ status: "disabled" }), makeKey({ status: "active" }));
    const uc = new TransitionApiKeyStatusUseCase(repo);
    const result = await uc.execute("key-1", "active");
    expect(result.status).toBe("active");
  });

  it("active → revoked succeeds", async () => {
    const repo = makeRepo(makeKey({ status: "active" }), makeKey({ status: "revoked" }));
    const uc = new TransitionApiKeyStatusUseCase(repo);
    const result = await uc.execute("key-1", "revoked");
    expect(result.status).toBe("revoked");
  });

  it("revoked → active throws ConflictException (409)", async () => {
    const repo = makeRepo(makeKey({ status: "revoked" }), null);
    const uc = new TransitionApiKeyStatusUseCase(repo);
    await expect(uc.execute("key-1", "active")).rejects.toBeInstanceOf(ConflictException);
  });

  it("revoked → disabled throws ConflictException (409)", async () => {
    const repo = makeRepo(makeKey({ status: "revoked" }), null);
    const uc = new TransitionApiKeyStatusUseCase(repo);
    await expect(uc.execute("key-1", "disabled")).rejects.toBeInstanceOf(ConflictException);
  });

  it("disabled → disabled throws ConflictException (same state)", async () => {
    const repo = makeRepo(makeKey({ status: "disabled" }), null);
    const uc = new TransitionApiKeyStatusUseCase(repo);
    await expect(uc.execute("key-1", "disabled")).rejects.toBeInstanceOf(ConflictException);
  });

  it("nonexistent key throws NotFoundException", async () => {
    const repo = makeRepo(null, null);
    const uc = new TransitionApiKeyStatusUseCase(repo);
    await expect(uc.execute("missing", "disabled")).rejects.toBeInstanceOf(NotFoundException);
  });
});
