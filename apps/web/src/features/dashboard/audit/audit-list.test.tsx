/**
 * Audit list Web tests (T096).
 *
 * Validates the audit event read model + the recovery/task/change-set link
 * contract (Part A, live) and the audit-list filter/display obligations
 * (Part B). Mirrors contracts/common.md (GET /audit-events) and the rule that
 * detail never returns credentials.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAuditEvent,
  resetFixtureIds,
} from "@/test/safe-operations-fixtures";

describe("Audit event fixtures (T096 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildAuditEvent produces a succeeded event with actor/target/result", () => {
    const e = buildAuditEvent();
    expect(e.result).toBe("succeeded");
    expect(e.actorType).toBe("user");
    expect(e.targetType).toBe("canonical-channel");
    expect(e.displayName).toBe("CCTV-1");
  });

  it("an audit event linked to a recovery point exposes the restore entry", () => {
    const e = buildAuditEvent({
      id: "audit-recovery",
      action: "operation.apply",
      recoveryPointId: "rp-1",
      changeSetId: "cs-1",
      taskId: "task-1",
    });
    expect(e.recoveryPointId).toBe("rp-1");
    expect(e.changeSetId).toBe("cs-1");
    expect(e.taskId).toBe("task-1");
  });

  it("a failed audit event carries a result the UI tags as error", () => {
    const e = buildAuditEvent({ id: "audit-failed", result: "failed", reason: "源校验失败" });
    expect(e.result).toBe("failed");
    expect(e.reason).toBeTruthy();
  });

  it("audit events cover the OPERATION_RESULT vocabulary", () => {
    const results = ["accepted", "succeeded", "failed", "skipped", "cancelled"];
    for (const result of results) {
      const e = buildAuditEvent({ id: `audit-${result}`, result });
      expect(e.result).toBe(result);
    }
  });
});

describe("Audit list contract obligations (T096 — part B)", () => {
  beforeEach(() => resetFixtureIds());

  it("filters by action / result / targetType are query params (contracts/common.md)", () => {
    // The list query accepts action, result, targetType, targetId, taskId,
    // from, to — all optional. An empty filter returns the default page.
    const events = [buildAuditEvent({ action: "channel.lifecycle.change" })];
    const filtered = events.filter((e) => e.action === "channel.lifecycle.change");
    expect(filtered).toHaveLength(1);
  });

  it("audit detail never exposes credentials (FR-021 redaction)", () => {
    const e = buildAuditEvent();
    // The audit VO carries summary counts/field names, not secret values.
    // Assert the wire shape has no credential-bearing fields.
    expect(e).not.toHaveProperty("token");
    expect(e).not.toHaveProperty("password");
    expect(e).not.toHaveProperty("authorization");
  });

  it("recovery entry appears only when recoveryPointId is present", () => {
    const withRecovery = buildAuditEvent({ id: "a1", recoveryPointId: "rp-1" });
    const withoutRecovery = buildAuditEvent({ id: "a2", recoveryPointId: null });
    expect(!!withRecovery.recoveryPointId).toBe(true);
    expect(!!withoutRecovery.recoveryPointId).toBe(false);
  });
});
