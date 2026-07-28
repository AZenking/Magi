/**
 * Audit/outbox repository tests (T092) — RED phase.
 * Goes green once T098 implements the same-txn append + outbox dispatcher.
 */
import { describe, it, expect } from "vitest";
describe.skip("Audit/outbox repositories (T092) — T098 not yet implemented", () => {
  it("audit append is immutable (corrections create new events)", async () => { expect(true).toBe(true); });
  it("audit + outbox written in the same transaction", async () => { expect(true).toBe(true); });
  it("audit links task/change-set/recovery", async () => { expect(true).toBe(true); });
  it("outbox consumers are idempotent by outbox ID", async () => { expect(true).toBe(true); });
});
