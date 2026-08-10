/**
 * AuditEventWriterRepository (T050).
 *
 * Verifies the audit row and its outbox notification are written through the
 * same transaction handle (atomicity), the outbox topic derives from the
 * action, and the returned event carries the generated id + occurredAt.
 *
 * The db connection is mocked so this is a pure unit test; the schema tables
 * are real Drizzle descriptors (pure objects, no connection).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/database/connection", () => ({
  db: { transaction: vi.fn() },
}));

import { db } from "@/infrastructure/database/connection";
import { AuditEventWriterRepository } from "@/infrastructure/database/audit-event-writer.repository";
import { auditEvents, outboxEvents } from "@/infrastructure/database/schema";
import type { AuditEvent } from "@/domain/audit";

function makeReturningChain(row: Record<string, unknown>) {
  return {
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([row]),
    })),
  };
}

function makeSimpleChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeMockTx(auditRow: Record<string, unknown>) {
  const auditChain = makeReturningChain(auditRow);
  const outboxChain = makeSimpleChain();
  return {
    auditChain,
    outboxChain,
    tx: {
      insert: vi.fn((table: unknown) =>
        table === auditEvents ? auditChain : outboxChain,
      ),
    },
  };
}

describe("AuditEventWriterRepository.appendWithOutbox", () => {
  beforeEach(() => {
    vi.mocked(db.transaction).mockReset();
  });

  it("writes audit + outbox in the same transaction", async () => {
    const { tx } = makeMockTx({ id: "audit-1", occurredAt: new Date("2026-08-01T00:00:00Z") });
    vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));

    const repo = new AuditEventWriterRepository();
    const input: Omit<AuditEvent, "id" | "occurredAt"> = {
      actorType: "user",
      actorId: "user-1",
      action: "device_client.revoked",
      targetType: "device_client",
      targetId: "device-1",
      displayName: "客厅电视",
      result: "succeeded",
      requestId: "req-1",
      taskId: null,
      parentTaskId: null,
      changeSetId: null,
      recoveryPointId: null,
      summary: { accessTokensRevoked: 2 },
      reason: "owner revocation",
    };

    const result = await repo.appendWithOutbox(input);

    // Both inserts use the same tx handle — atomic.
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenNthCalledWith(1, auditEvents);
    expect(tx.insert).toHaveBeenNthCalledWith(2, outboxEvents);
    // Returned event carries generated id + occurredAt, spread over input data.
    expect(result.id).toBe("audit-1");
    expect(result.occurredAt).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(result.action).toBe("device_client.revoked");
  });

  it("derives the outbox topic from the action", async () => {
    const { tx, outboxChain } = makeMockTx({ id: "audit-2", occurredAt: new Date() });
    vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));

    const repo = new AuditEventWriterRepository();
    await repo.appendWithOutbox({
      actorType: "system",
      actorId: "system",
      action: "device_client.registered",
      targetType: "device_client",
      targetId: "device-9",
      displayName: null,
      result: "succeeded",
      requestId: null,
      taskId: null,
      parentTaskId: null,
      changeSetId: null,
      recoveryPointId: null,
      summary: null,
      reason: null,
    });

    expect(outboxChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "audit.device_client.registered",
        aggregateType: "device_client",
        aggregateId: "device-9",
        status: "pending",
        attempts: 0,
      }),
    );
  });

  it("includes auditEventId + result in the outbox payload", async () => {
    const { tx, outboxChain } = makeMockTx({ id: "evt-77", occurredAt: new Date() });
    vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));

    const repo = new AuditEventWriterRepository();
    await repo.appendWithOutbox({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.renamed",
      targetType: "device_client",
      targetId: "device-1",
      displayName: null,
      result: "failed",
      requestId: null,
      taskId: null,
      parentTaskId: null,
      changeSetId: null,
      recoveryPointId: null,
      summary: null,
      reason: null,
    });

    const outboxArg = (outboxChain.values.mock.calls as unknown as Record<string, unknown>[][])[0]![0]!;
    expect(outboxArg.payload).toEqual({ auditEventId: "evt-77", result: "failed" });
  });

  it("propagates the redacted summary into the audit row", async () => {
    const { tx, auditChain } = makeMockTx({ id: "audit-3", occurredAt: new Date() });
    vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));

    const repo = new AuditEventWriterRepository();
    await repo.appendWithOutbox({
      actorType: "user",
      actorId: "user-1",
      action: "device_client.auto_registered",
      targetType: "device_client",
      targetId: "device-2",
      displayName: null,
      result: "succeeded",
      requestId: null,
      taskId: null,
      parentTaskId: null,
      changeSetId: null,
      recoveryPointId: null,
      summary: { accessToken: "[redacted]", deviceCount: 1 },
      reason: null,
    });

    const auditValues = (auditChain.values.mock.calls as unknown as Record<string, unknown>[][])[0]![0]!;
    expect(auditValues.summary).toEqual({ accessToken: "[redacted]", deviceCount: 1 });
  });
});
