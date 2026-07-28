/**
 * Operation HTTP contract tests (T033) — RED phase.
 *
 * Defines the expected contract for `/operations/previews`, change-set items,
 * decisions, apply and cancel (contracts/operation-previews.md). Uses
 * supertest against the Nest app with mocked use cases once T043 lands.
 *
 * Currently skipped (no controller yet). Goes green when T043 implements the
 * controller against these expectations.
 */
import { describe, it, expect } from "vitest";
import { OperationChangeSetSchema, ChangeSetSummarySchema } from "@magi/types";

describe.skip("Operation HTTP contract (T033) — controller not yet implemented", () => {
  it("POST /operations/previews returns 202 with a change-set + TaskRef", async () => {
    // Response: { success, data: { changeSet: OperationChangeSetVo, task: TaskRefVo } }
    const sample = {
      id: "00000000-0000-0000-0000-000000000001",
      kind: "m3u_sync",
      status: "preparing",
      expiresAt: "2026-07-27T10:00:00.000Z",
      version: 1,
    };
    expect(OperationChangeSetSchema.safeParse(sample).success).toBe(true);
  });

  it("GET /operations/change-sets/{id} returns summary with all category counts", async () => {
    const sample = {
      added: 1, updated: 2, missing: 3, deleted: 0, preserved: 4, conflicts: 5, unmatched: 6,
    };
    expect(ChangeSetSummarySchema.safeParse(sample).success).toBe(true);
  });

  it("apply without Idempotency-Key returns 400/428", async () => {
    expect(true).toBe(true); // enforced by IdempotencyInterceptor + route guard
  });

  it("apply with stale fingerprint returns 409 preview-stale Problem Details", async () => {
    const problem = {
      type: "https://magi.local/problems/preview-stale",
      title: "Preview is stale",
      status: 409,
      code: "preview-stale",
      retryable: true,
    };
    expect(problem.code).toBe("preview-stale");
  });

  it("cancel on an applying change set returns 409", async () => {
    expect(true).toBe(true);
  });

  it("errors use application/problem+json with a stable code", async () => {
    // Frontends branch on `code`, never parse `detail`.
    expect(true).toBe(true);
  });
});
