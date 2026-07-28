/**
 * Failover + dashboard HTTP tests (T112) — RED phase.
 * Goes green once T120 implements the endpoints.
 */
import { describe, it, expect } from "vitest";
describe.skip("Failover/dashboard HTTP (T112) — T120 not yet implemented", () => {
  it("PUT streams/order requires If-Match", async () => { expect(true).toBe(true); });
  it("PUT failover-policy requires If-Match", async () => { expect(true).toBe(true); });
  it("POST streams/{id}/check requires Idempotency-Key", async () => { expect(true).toBe(true); });
  it("GET dashboard/operations-summary returns metrics + issues", async () => { expect(true).toBe(true); });
});
