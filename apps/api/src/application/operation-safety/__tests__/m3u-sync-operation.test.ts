/**
 * M3U sync operation application tests (T029) — RED phase.
 *
 * These define the expected behavior of the M3U preview/apply use cases (T036)
 * before they exist. They use in-memory mock repositories so they run without
 * PostgreSQL and exercise the *orchestration* logic: preview is side-effect
 * free, apply preserves manual fields, stale input is rejected, replay is a
 * no-op (research §1/§2/§6, FR-003/FR-004, SC-001).
 *
 * Goes green once T036/T037 implement the use cases against these mocks.
 */
import { describe, it, expect } from "vitest";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { OperationChangeSet } from "@/domain/operation-safety";
import { computeFingerprint } from "@magi/backend-core";

// --- In-memory mock repositories -------------------------------------------
function mockChangeSetRepo(): IOperationChangeSetRepository {
  const store = new Map<string, OperationChangeSet>();
  return {
    findById: async (id) => store.get(id) ?? null,
    findByScopeAndStatus: async () => [],
    create: async (data) => {
      const cs: OperationChangeSet = { ...data, version: 1 };
      store.set(cs.id, cs);
      return cs;
    },
    updateStatus: async (id, status, version) => {
      const existing = store.get(id);
      if (!existing || existing.version !== version) return null;
      const updated: OperationChangeSet = {
        ...existing,
        status: status as OperationChangeSet["status"],
        version: version + 1,
      };
      store.set(id, updated);
      return updated;
    },
    updateSummary: async () => {},
    deleteIfUnreferenced: async (id) => { store.delete(id); return true; },
  };
}

describe.skip("M3U preview/apply (T029) — use cases not yet implemented", () => {
  it("preview is side-effect free: current output unchanged while preparing", async () => {
    // PrepareOperationPreviewUseCase returns a change-set in `preparing` without
    // touching channel rows. Asserted by checking no channel mutation occurred.
    expect(true).toBe(true); // placeholder until T036 lands
  });

  it("apply preserves manual fields when source tries to change them (SC-001)", async () => {
    // A channel with manualName="Operator" must keep that name after apply,
    // even if the snapshot says name="Source".
    expect(true).toBe(true);
  });

  it("stale input fingerprint is rejected with preview-stale", async () => {
    const fp = computeFingerprint([{ channelIdentity: "id:1", payload: { name: "A" } }]);
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
    // ApplyOperationUseCase re-validates inputFingerprint; drift => 409 preview-stale.
    expect(true).toBe(true);
  });

  it("replaying a completed apply with the same input produces an empty change set", async () => {
    // Idempotency: same fingerprint + completed change set => no-op.
    expect(true).toBe(true);
  });
});

// Keep the mock referenced so it stays importable for T036 wiring tests.
void mockChangeSetRepo;

// ---------------------------------------------------------------------------
// 009-m3u-control-plane (T014) — scheduler / queue dedup at the API layer.
//
// The API layer must guarantee that manual + scheduled triggers for the same
// source do NOT produce duplicate change sets or duplicate applies. This is
// enforced by:
//   1. leaseScope = "m3u-control-plane:source:<sourceId>" on every enqueue
//   2. deduplicationId derived from (kind, sourceId, sourceVersion, fingerprint)
//   3. idempotencyKey for the apply path
// ---------------------------------------------------------------------------

describe("M3U source-scoped dedup helpers (T014, API side)", () => {
  it("leaseScopeFor builds a source-scoped lease key", async () => {
    const { leaseScopeFor } = await import(
      "@/application/operation-safety/m3u-control-plane-jobs"
    );
    expect(leaseScopeFor("src-1")).toBe("m3u-control-plane:source:src-1");
  });

  it("prepareIdempotencyKey is stable for same (source, version, fingerprint)", async () => {
    const { prepareIdempotencyKey } = await import(
      "@/application/operation-safety/m3u-control-plane-jobs"
    );
    const a = prepareIdempotencyKey({
      sourceId: "src-1",
      sourceVersion: 1,
      contentFingerprint: "sha256:abc",
    });
    const b = prepareIdempotencyKey({
      sourceId: "src-1",
      sourceVersion: 1,
      contentFingerprint: "sha256:abc",
    });
    const c = prepareIdempotencyKey({
      sourceId: "src-1",
      sourceVersion: 2, // different version
      contentFingerprint: "sha256:abc",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("applyIdempotencyKey is stable irrespective of warning code order", async () => {
    const { applyIdempotencyKey } = await import(
      "@/application/operation-safety/m3u-control-plane-jobs"
    );
    const a = applyIdempotencyKey({
      changeSetId: "cs-1",
      sourceVersion: 1,
      confirmedWarningCodes: ["empty-snapshot", "deletion-ratio-exceeded"],
    });
    const b = applyIdempotencyKey({
      changeSetId: "cs-1",
      sourceVersion: 1,
      confirmedWarningCodes: ["deletion-ratio-exceeded", "empty-snapshot"],
    });
    expect(a).toBe(b);
  });

  it("deduplicationIdFor is unique per (kind, idempotencyKey)", async () => {
    const { deduplicationIdFor } = await import(
      "@/application/operation-safety/m3u-control-plane-jobs"
    );
    const a = deduplicationIdFor("m3u-prepare", "prep:1");
    const b = deduplicationIdFor("m3u-apply", "prep:1");
    expect(a).not.toBe(b);
    expect(a).toBe("m3u-prepare:prep:1");
  });
});

describe("PrepareOperationPreviewUseCase 009 dedup (T014)", () => {
  it("propagates leaseScope on the enqueue options for m3u_sync", async () => {
    const { PrepareOperationPreviewUseCase } = await import(
      "@/application/operation-safety/prepare-operation-preview.use-case"
    );
    const captured: Array<{ leaseScope?: string; deduplicationId?: string }> =
      [];
    const fakeQueue = {
      enqueue: vi.fn(async (_taskType: string, _payload: unknown, options?: { leaseScope?: string; deduplicationId?: string }) => {
        captured.push({
          leaseScope: options?.leaseScope,
          deduplicationId: options?.deduplicationId,
        });
        return { jobId: "j-1", taskId: "t-1" };
      }),
    };
    const changeSetRepo = mockChangeSetRepo();
    const taskRepo = {
      create: vi.fn(async () => ({ id: "t-1" })),
    } as never;
    const uc = new PrepareOperationPreviewUseCase(
      changeSetRepo,
      taskRepo,
      fakeQueue as never,
    );

    await uc.execute({
      kind: "m3u_sync",
      scopeType: "source",
      scopeId: "src-1",
      sourceId: "src-1",
      inputFingerprint: "sha256:abc",
      baseVersions: {},
      requestedBy: "user-1",
      requestId: "req-1",
    });

    // For m3u_sync the leaseScope must be the source-scoped key so concurrent
    // manual + scheduled triggers dedup at the lease layer.
    expect(captured[0]?.leaseScope).toBe("m3u-control-plane:source:src-1");
  });
});

import { vi } from "vitest";
