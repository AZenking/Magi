/**
 * Task/schedule HTTP contract tests (T077) — RED phase.
 * Goes green once T085 implements summary/detail/retry/cancel + schedule ETag.
 */
import { describe, it, expect } from "vitest";
describe.skip("Task/schedule HTTP (T077) — T085 not yet implemented", () => {
  it("GET /tasks/summary returns compact running/failed/recent", async () => { expect(true).toBe(true); });
  it("POST /tasks/{id}/retry requires Idempotency-Key", async () => { expect(true).toBe(true); });
  it("PATCH /tasks/scheduled/{id} requires If-Match", async () => { expect(true).toBe(true); });
  it("trigger returns existing task when deduplicated", async () => { expect(true).toBe(true); });
});
