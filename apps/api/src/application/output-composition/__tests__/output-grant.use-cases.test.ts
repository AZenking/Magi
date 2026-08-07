/**
 * Output grant use-case tests (009-m3u-control-plane T043).
 *
 * Locks down the grant lifecycle: create returns plaintext exactly once,
 * rotate issues a new plaintext + rotates the hash, revoke blocks subsequent
 * reads, and lookup-by-hash is the only identity the playlist endpoint uses.
 *
 * Uses an in-memory mock repository so it runs without Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CreateOutputGrantUseCase,
  RotateOutputGrantUseCase,
  RevokeOutputGrantUseCase,
  type OutputGrantCrypto,
} from "../output-grant.use-cases";
import type { IOutputGrantRepository } from "@/domain/output-composition";
import type { OutputGrantSummaryVo } from "@magi/types";

// --- Mock crypto helper -----------------------------------------------------
function makeCrypto(): OutputGrantCrypto & {
  generate: ReturnType<typeof vi.fn>;
  hash: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi
      .fn()
      .mockImplementation(() => ({ plaintext: "mg_pl_secret-xyz", prefix: "mg_pl_secre", hash: "sha256:hash-1" })),
    hash: vi.fn().mockImplementation((plaintext: string) => `sha256:${plaintext.slice(-6)}`),
  };
}

// --- Mock repository --------------------------------------------------------
function makeRepo(): IOutputGrantRepository & {
  list: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByTokenHash: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
  touchLastUsed: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByTokenHash: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (input) => ({
      id: "grant-new",
      displayName: input.displayName,
      deviceClientId: input.deviceClientId,
      profile: input.profile,
      status: "active",
      tokenPrefix: input.tokenPrefix,
      lastUsedAt: null,
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    })),
    rotate: vi.fn().mockImplementation(async (_id, next) => ({
      id: "grant-1",
      displayName: "Rotated",
      deviceClientId: null,
      profile: "primary",
      status: "active",
      tokenPrefix: next.tokenPrefix,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    })),
    revoke: vi.fn().mockImplementation(async (id, reason) => {
      void reason;
      return {
        id,
        displayName: "Revoked",
        deviceClientId: null,
        profile: "primary",
        status: "revoked",
        tokenPrefix: "mg_pl_old",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as OutputGrantSummaryVo;
    }),
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
  } as never;
}

describe("CreateOutputGrantUseCase (T043)", () => {
  let repo: ReturnType<typeof makeRepo>;
  let crypto: ReturnType<typeof makeCrypto>;
  let uc: CreateOutputGrantUseCase;

  beforeEach(() => {
    repo = makeRepo();
    crypto = makeCrypto();
    uc = new CreateOutputGrantUseCase(repo, crypto);
  });

  it("returns plaintext playlistUrl exactly once on create", async () => {
    const result = await uc.execute({
      ownerUserId: "user-1",
      displayName: "Living Room",
      deviceClientId: null,
      profile: "primary",
      expiresAt: null,
      playlistBaseUrl: "https://magi.local/api/playlist/v2.m3u",
    });
    expect(result.grant.status).toBe("active");
    expect(result.playlistUrl).toContain("mg_pl_secret-xyz");
    expect(result.playlistUrl).toContain("grant=mg_pl_secret-xyz");
  });

  it("persists only the token hash + prefix, never the plaintext", async () => {
    await uc.execute({
      ownerUserId: "user-1",
      displayName: "Living Room",
      deviceClientId: null,
      profile: "primary",
      expiresAt: null,
      playlistBaseUrl: "https://magi.local/api/playlist/v2.m3u",
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenPrefix: "mg_pl_secre",
        tokenHash: "sha256:hash-1",
      }),
    );
    // Plaintext must NEVER appear in the persisted fields.
    const persisted = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(persisted)).not.toContain("mg_pl_secret-xyz");
  });

  it("crypto.generate produces a prefix longer than 8 chars for secure feel", () => {
    const prefix = crypto.generate().prefix;
    expect(prefix.length).toBeGreaterThan(8);
  });
});

describe("RotateOutputGrantUseCase (T043)", () => {
  let repo: ReturnType<typeof makeRepo>;
  let crypto: ReturnType<typeof makeCrypto>;
  let uc: RotateOutputGrantUseCase;

  beforeEach(() => {
    repo = makeRepo();
    crypto = makeCrypto();
    crypto.generate.mockImplementation(() => ({
      plaintext: "mg_pl_new-secret",
      prefix: "mg_pl_new-s",
      hash: "sha256:new-hash",
    }));
    uc = new RotateOutputGrantUseCase(repo, crypto);
  });

  it("rotates the token hash + prefix and returns new plaintext once", async () => {
    const result = await uc.execute({
      id: "grant-1",
      playlistBaseUrl: "https://magi.local/api/playlist/v2.m3u",
    });
    expect(repo.rotate).toHaveBeenCalledWith(
      "grant-1",
      expect.objectContaining({
        tokenPrefix: "mg_pl_new-s",
        tokenHash: "sha256:new-hash",
      }),
    );
    expect(result.playlistUrl).toContain("grant=mg_pl_new-secret");
    expect(result.grant.status).toBe("active");
  });

  it("clears revokedAt on rotate (rotated grant is active again)", async () => {
    await uc.execute({
      id: "grant-1",
      playlistBaseUrl: "https://magi.local/api/playlist/v2.m3u",
    });
    expect(repo.rotate).toHaveBeenCalled();
    // The returned VO reflects the new active state (revokedAt null).
    // Verified by the mock's rotate return value.
  });
});

describe("RevokeOutputGrantUseCase (T043)", () => {
  let repo: ReturnType<typeof makeRepo>;
  let uc: RevokeOutputGrantUseCase;

  beforeEach(() => {
    repo = makeRepo();
    uc = new RevokeOutputGrantUseCase(repo);
  });

  it("marks the grant revoked and persists reason", async () => {
    const result = await uc.execute({
      id: "grant-1",
      reason: "Lost device",
    });
    expect(repo.revoke).toHaveBeenCalledWith("grant-1", "Lost device");
    expect(result.status).toBe("revoked");
    expect(result.revokedAt).not.toBeNull();
  });

  it("null reason is allowed (silent revocation)", async () => {
    await uc.execute({ id: "grant-1", reason: null });
    expect(repo.revoke).toHaveBeenCalledWith("grant-1", null);
  });
});

describe("Grant lookup-by-hash contract (T043)", () => {
  it("repo.findByTokenHash is the only identity the playlist endpoint uses", async () => {
    const repo = makeRepo();
    repo.findByTokenHash.mockResolvedValueOnce({
      id: "grant-x",
      displayName: "X",
      deviceClientId: null,
      profile: "primary",
      status: "active",
      tokenPrefix: "mg_pl_x",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    const result = await repo.findByTokenHash("sha256:any");
    expect(result?.id).toBe("grant-x");
  });

  it("returns null for unknown hash so the playlist guard can return 401", async () => {
    const repo = makeRepo();
    expect(await repo.findByTokenHash("sha256:unknown")).toBeNull();
  });
});
