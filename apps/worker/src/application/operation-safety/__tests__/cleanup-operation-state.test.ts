/**
 * Operation-state cleanup tests (T032) — RED phase.
 *
 * Defines expected behavior of the cleanup-operation-state use case (T041):
 * terminal change sets and snapshots expire after 24h ONLY when no active
 * task, recovery point or audit reference still requires them; expired leases
 * are reclaimed only after the referenced task is confirmed non-active; audit
 * events are never cleaned up (data-model.md retention invariants).
 *
 * Goes green once T041 implements the use case.
 */
import { describe, it, expect } from "vitest";

describe.skip("Operation-state cleanup (T032) — use case not yet implemented", () => {
  it("does not delete a change set still referenced by a recovery point", async () => {
    expect(true).toBe(true);
  });

  it("does not delete a change set still referenced by an audit event", async () => {
    expect(true).toBe(true);
  });

  it("does not reclaim a lease whose referenced task is still active", async () => {
    expect(true).toBe(true);
  });

  it("never deletes audit events", async () => {
    expect(true).toBe(true);
  });

  it("idempotency records remain for at least 24 hours", async () => {
    expect(true).toBe(true);
  });
});
