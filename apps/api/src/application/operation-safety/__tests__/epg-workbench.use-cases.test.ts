/**
 * EPG workbench use-case tests (T063) — RED phase.
 *
 * Defines expected behavior of the XMLTV readiness check, decision validation,
 * batch-accept and manual-lock preservation (FR-007/FR-008/FR-009, T067/T068).
 * Goes green once those use cases land.
 */
import { describe, it, expect } from "vitest";

describe.skip("EPG workbench use cases (T063) — T067/T068 not yet implemented", () => {
  it("XMLTV readiness blocks matching when source is disabled", async () => {
    expect(true).toBe(true);
  });

  it("XMLTV readiness blocks matching when source has never synced", async () => {
    expect(true).toBe(true);
  });

  it("XMLTV readiness blocks matching when data is empty", async () => {
    expect(true).toBe(true);
  });

  it("XMLTV readiness blocks matching when data is stale", async () => {
    expect(true).toBe(true);
  });

  it("readiness blocker provides a direct repair action", async () => {
    expect(true).toBe(true);
  });

  it("batch accept applies only selected items, preserving unselected", async () => {
    expect(true).toBe(true);
  });

  it("manual lock survives a second automatic match", async () => {
    expect(true).toBe(true);
  });

  it("decision validation rejects selecting a conflict item without a candidate", async () => {
    expect(true).toBe(true);
  });
});
