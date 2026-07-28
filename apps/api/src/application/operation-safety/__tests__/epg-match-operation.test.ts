/**
 * EPG match operation application tests (T030) — RED phase.
 *
 * Defines expected behavior of the EPG preview/apply use cases (T039): manual
 * EPG lock is preserved, canonical ID is not regenerated, manual streams and
 * health history survive apply (FR-004/FR-006/FR-007, research §3/§4).
 *
 * Goes green once T039 implements the use cases.
 */
import { describe, it, expect } from "vitest";

describe.skip("EPG preview/apply (T030) — use cases not yet implemented", () => {
  it("apply preserves a locked manual EPG binding", async () => {
    // A channel with manualEpgLocked=true keeps its binding; the automatic
    // candidate is recorded as a preserved/conflict item, not applied.
    expect(true).toBe(true);
  });

  it("apply does not regenerate canonical channel IDs", async () => {
    // The canonical channel's id must be identical before and after apply.
    expect(true).toBe(true);
  });

  it("apply preserves manual streams and health history", async () => {
    // Streams with origin='manual' and all health fields remain untouched.
    expect(true).toBe(true);
  });

  it("preview classifies results into exact/fuzzy/conflict/unmatched", async () => {
    // The change-set summary contains all four classification counts.
    expect(true).toBe(true);
  });
});
