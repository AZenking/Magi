/**
 * Operation API contract tests for 009-m3u-control-plane (T013) — RED phase.
 *
 * Defines the expected contract for the M3U control-plane preview/apply flow:
 *   - Normal change set (requiresConfirmation=false) auto-applies
 *   - Empty / 25%-deletion change set (requiresConfirmation=true) requires
 *     explicit confirmation (warning code acknowledgment) — applying without
 *     it returns 409 confirmation-required
 *
 * Uses in-memory mock repositories so the contract is enforceable without
 * PostgreSQL. The actual HTTP boundary is exercised in the broader operation
 * controller test; here we lock down the *use case contract* the controller
 * delegates to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { OperationChangeSet } from "@/domain/operation-safety";
import type {
  IOperationLeaseRepository,
  IRecoveryPointRepository,
} from "@/domain/operation-safety";
import type { ITaskRepository } from "@/domain/task-execution";
import type { TaskQueuePort } from "@/domain/task-execution/task-queue.port";
import type { IdempotencyRepository } from "@/infrastructure/database/idempotency.repository";
import { ApplyOperationUseCase } from "@/application/operation-safety/apply-operation.use-case";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------
function makeMockChangeSet(
  overrides: Partial<OperationChangeSet> = {},
): OperationChangeSet {
  return {
    id: "cs-1",
    kind: "m3u_sync",
    status: "ready",
    scopeType: "source",
    scopeId: "src-1",
    sourceId: "src-1",
    snapshotId: "snap-1",
    inputFingerprint: "sha256:test",
    summary: { added: 1, updated: 0, missing: 0, deleted: 0, preserved: 0, conflicts: 0, unmatched: 0 },
    warnings: [],
    blockers: [],
    requestedBy: "user-1",
    prepareTaskId: null,
    applyTaskId: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    requiresConfirmation: false,
    sourceVersion: 1,
    anomalyClassification: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeChangeSetRepo(cs: OperationChangeSet) {
  const store = new Map<string, OperationChangeSet>([[cs.id, cs]]);
  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findByScopeAndStatus: vi.fn(async () => []),
    create: vi.fn(async (data: OperationChangeSet) => {
      store.set(data.id, data);
      return data;
    }),
    updateStatus: vi.fn(async (id: string, status: string, version: number) => {
      const cur = store.get(id);
      if (!cur || cur.version !== version) return null;
      const next = { ...cur, status: status as OperationChangeSet["status"], version: version + 1 };
      store.set(id, next);
      return next;
    }),
    updateSummary: vi.fn(async () => {}),
    deleteIfUnreferenced: vi.fn(async (id: string) => {
      store.delete(id);
      return true;
    }),
  } as unknown as IOperationChangeSetRepository;
}

function makeLeaseRepo() {
  return {
    acquireOrReturnExisting: vi.fn(async () => ({ acquired: true, ownerTaskId: null })),
    heartbeat: vi.fn(async () => true),
    reclaimIfExpired: vi.fn(async () => true),
  } as unknown as IOperationLeaseRepository;
}

function makeRecoveryRepo() {
  return {
    create: vi.fn(async (data: { status: string }) => ({
      id: "rp-1",
      status: data.status as "creating",
      operationKind: "m3u_sync",
      scopeType: "source",
      scopeId: "src-1",
      changeSetId: "cs-1",
      taskId: "task-1",
      schemaVersion: 1,
      itemCount: 0,
      checksum: "pending",
      createdBy: "user-1",
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    markReady: vi.fn(async () => ({})),
    addItem: vi.fn(async () => ({})),
    findById: vi.fn(async () => null),
    findByChangeSetId: vi.fn(async () => []),
    deleteExpired: vi.fn(async () => 0),
  } as unknown as IRecoveryPointRepository;
}

function makeTaskRepo() {
  return {
    create: vi.fn(async () => ({ id: "task-1" })),
    update: vi.fn(async () => ({})),
    findById: vi.fn(async () => null),
    findActiveBySource: vi.fn(async () => null),
  } as unknown as ITaskRepository;
}

function makeQueue() {
  return {
    enqueue: vi.fn(async () => ({ jobId: "job-1", taskId: "task-1" })),
    cancel: vi.fn(async () => true),
    retry: vi.fn(async () => ({ retried: true })),
    getJobState: vi.fn(async () => "waiting"),
    getJobDetail: vi.fn(async () => null),
    getScheduledJobs: vi.fn(async () => []),
    updateSchedule: vi.fn(async () => undefined),
    triggerScheduledJob: vi.fn(async () => ({ taskId: "task-1" })),
  } as unknown as TaskQueuePort;
}

function makeIdempotencyRepo() {
  return {
    tryRecord: vi.fn(async () => ({ recorded: true, hit: { matchedFingerprint: false } })),
    saveResponse: vi.fn(async () => undefined),
  } as unknown as IdempotencyRepository;
}

// ---------------------------------------------------------------------------
// Contract: normal auto-apply path
// ---------------------------------------------------------------------------
describe("M3U control-plane operation contract (T013) — normal auto-apply", () => {
  let cs: OperationChangeSet;
  let repo: IOperationChangeSetRepository;
  let apply: ApplyOperationUseCase;

  beforeEach(() => {
    cs = makeMockChangeSet({
      requiresConfirmation: false,
      warnings: [],
      summary: { added: 5, updated: 2, missing: 0, deleted: 0, preserved: 1, conflicts: 0, unmatched: 0 },
    });
    repo = makeChangeSetRepo(cs);
    apply = new ApplyOperationUseCase(
      repo,
      makeLeaseRepo(),
      makeRecoveryRepo(),
      makeTaskRepo(),
      makeQueue(),
      makeIdempotencyRepo(),
    );
  });

  it("applies a normal change set without confirmed warnings", async () => {
    const result = await apply.execute({
      changeSetId: "cs-1",
      expectedVersion: 1,
      confirmedWarningCodes: [],
      actorId: "user-1",
    });

    expect(result.changeSetId).toBe("cs-1");
    expect(result.deduplicated).toBe(false);
    expect(result.taskId).toBe("task-1");
  });

  it("transitions the change set to applying", async () => {
    await apply.execute({
      changeSetId: "cs-1",
      expectedVersion: 1,
      confirmedWarningCodes: [],
      actorId: "user-1",
    });

    const updated = await repo.findById("cs-1");
    expect(updated?.status).toBe("applying");
  });
});

// ---------------------------------------------------------------------------
// Contract: requiresConfirmation gate
// ---------------------------------------------------------------------------
describe("M3U control-plane operation contract (T013) — confirmation gate", () => {
  it("rejects apply on empty-snapshot change set without confirmedWarningCodes", async () => {
    const cs = makeMockChangeSet({
      requiresConfirmation: true,
      warnings: [
        { code: "empty-snapshot", message: "snapshot is empty while source has entries" },
      ],
      anomalyClassification: { requiresConfirmation: true, warnings: [{ code: "empty-snapshot", message: "", deletionRatio: 1 }] },
      summary: { added: 0, updated: 0, missing: 8, deleted: 0, preserved: 0, conflicts: 0, unmatched: 0 },
    });
    const apply = new ApplyOperationUseCase(
      makeChangeSetRepo(cs),
      makeLeaseRepo(),
      makeRecoveryRepo(),
      makeTaskRepo(),
      makeQueue(),
      makeIdempotencyRepo(),
    );

    await expect(
      apply.execute({
        changeSetId: "cs-1",
        expectedVersion: 1,
        confirmedWarningCodes: [],
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({
      // ConflictException carries code in the response payload
      response: expect.objectContaining({ code: "confirmation-required" }),
    });
  });

  it("rejects apply on 25%-deletion change set without confirmedWarningCodes", async () => {
    const cs = makeMockChangeSet({
      requiresConfirmation: true,
      warnings: [
        { code: "deletion-ratio-exceeded", message: "deletion ratio 0.25 ≥ 0.25" },
      ],
      anomalyClassification: {
        requiresConfirmation: true,
        warnings: [{ code: "deletion-ratio-exceeded", message: "", deletionRatio: 0.25 }],
      },
      summary: { added: 0, updated: 0, missing: 1, deleted: 0, preserved: 3, conflicts: 0, unmatched: 0 },
    });
    const apply = new ApplyOperationUseCase(
      makeChangeSetRepo(cs),
      makeLeaseRepo(),
      makeRecoveryRepo(),
      makeTaskRepo(),
      makeQueue(),
      makeIdempotencyRepo(),
    );

    await expect(
      apply.execute({
        changeSetId: "cs-1",
        expectedVersion: 1,
        confirmedWarningCodes: [],
        actorId: "user-1",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("accepts apply when all anomaly warning codes are confirmed", async () => {
    const cs = makeMockChangeSet({
      requiresConfirmation: true,
      warnings: [
        { code: "deletion-ratio-exceeded", message: "deletion ratio 0.5 ≥ 0.25" },
        { code: "empty-snapshot", message: "snapshot empty" },
      ],
      anomalyClassification: {
        requiresConfirmation: true,
        warnings: [
          { code: "deletion-ratio-exceeded", message: "", deletionRatio: 0.5 },
          { code: "empty-snapshot", message: "", deletionRatio: 1 },
        ],
      },
    });
    const apply = new ApplyOperationUseCase(
      makeChangeSetRepo(cs),
      makeLeaseRepo(),
      makeRecoveryRepo(),
      makeTaskRepo(),
      makeQueue(),
      makeIdempotencyRepo(),
    );

    const result = await apply.execute({
      changeSetId: "cs-1",
      expectedVersion: 1,
      confirmedWarningCodes: ["deletion-ratio-exceeded", "empty-snapshot"],
      operatorReason: "Upstream renamed lineup; operator approves refresh",
      actorId: "user-1",
    });

    expect(result.changeSetId).toBe("cs-1");
  });

  it("rejects when only some anomaly warning codes are confirmed", async () => {
    const cs = makeMockChangeSet({
      requiresConfirmation: true,
      warnings: [
        { code: "deletion-ratio-exceeded", message: "" },
        { code: "empty-snapshot", message: "" },
      ],
      anomalyClassification: {
        requiresConfirmation: true,
        warnings: [
          { code: "deletion-ratio-exceeded", message: "", deletionRatio: 0.5 },
          { code: "empty-snapshot", message: "", deletionRatio: 1 },
        ],
      },
    });
    const apply = new ApplyOperationUseCase(
      makeChangeSetRepo(cs),
      makeLeaseRepo(),
      makeRecoveryRepo(),
      makeTaskRepo(),
      makeQueue(),
      makeIdempotencyRepo(),
    );

    await expect(
      apply.execute({
        changeSetId: "cs-1",
        expectedVersion: 1,
        confirmedWarningCodes: ["deletion-ratio-exceeded"],
        actorId: "user-1",
      }),
    ).rejects.toThrow(ConflictException);
  });
});