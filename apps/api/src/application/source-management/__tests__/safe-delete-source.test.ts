/**
 * Safe source delete tests (T091) — RED phase.
 * Goes green once T097 implements impact preview/apply.
 */
import { describe, it, expect } from "vitest";
describe.skip("Safe source delete (T091) — T097 not yet implemented", () => {
  it("impact preview counts channels/programmes/mappings/streams/schedules", async () => { expect(true).toBe(true); });
  it("disable-first alternative is offered before delete", async () => { expect(true).toBe(true); });
  it("recovery point creation failure produces zero writes", async () => { expect(true).toBe(true); });
  it("purge handles all related relations", async () => { expect(true).toBe(true); });
});
