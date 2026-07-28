/**
 * EPG workbench HTTP contract tests (T064) — RED phase.
 *
 * Defines the contract for change-item classification filtering, decision
 * patch, stale/conflict responses (contracts/operation-previews.md).
 * Goes green once T068/T070 land.
 */
import { describe, it, expect } from "vitest";

describe.skip("EPG workbench HTTP contract (T064) — T068/T070 not yet implemented", () => {
  it("GET items?classification=conflict returns only conflict items", async () => {
    expect(true).toBe(true);
  });

  it("PATCH items with a valid decision updates selected state", async () => {
    expect(true).toBe(true);
  });

  it("PATCH items on an expired change set returns 410 preview-expired", async () => {
    expect(true).toBe(true);
  });

  it("PATCH items selecting a conflict without candidate returns 422", async () => {
    expect(true).toBe(true);
  });
});
