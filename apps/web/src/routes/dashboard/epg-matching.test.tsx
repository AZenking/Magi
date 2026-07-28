/**
 * EPG workbench Web tests (T065).
 *
 * Part A (live): validates EPG fixture builders. Part B (skipped): defines
 * workbench render expectations (T071/T072).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildEpgWorkbenchItems, resetFixtureIds } from "@/test/safe-operations-fixtures";

describe("EPG workbench fixtures (T065 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildEpgWorkbenchItems produces all four classifications", () => {
    const items = buildEpgWorkbenchItems({ exact: 3, fuzzy: 2, conflict: 2, unmatched: 1 });
    const classes = new Set(items.map((i) => i.classification));
    expect(classes.has("exact")).toBe(true);
    expect(classes.has("fuzzy")).toBe(true);
    expect(classes.has("conflict")).toBe(true);
    expect(classes.has("unmatched")).toBe(true);
  });

  it("fuzzy items carry confidence < 1", () => {
    const items = buildEpgWorkbenchItems({ fuzzy: 1 });
    const fuzzy = items.find((i) => i.classification === "fuzzy");
    expect(fuzzy?.confidence).toBeLessThan(1);
    expect(fuzzy?.confidence).toBeGreaterThan(0);
  });

  it("exact items are selected by default; conflict are not", () => {
    const items = buildEpgWorkbenchItems({ exact: 1, conflict: 1 });
    const exact = items.find((i) => i.classification === "exact");
    const conflict = items.find((i) => i.classification === "conflict");
    expect(exact?.selected).toBe(true);
    expect(conflict?.selected).toBe(false);
  });
});

describe.skip("EPG workbench UI (T065 — part B, T071/T072 not yet implemented)", () => {
  it("renders four classification tabs with counts", async () => {
    expect(true).toBe(true);
  });

  it("candidate detail shows confidence + reason", async () => {
    expect(true).toBe(true);
  });

  it("batch accept applies only selected results", async () => {
    expect(true).toBe(true);
  });

  it("manual lock toggle is visible and persists", async () => {
    expect(true).toBe(true);
  });

  it("invalid source shows a direct repair CTA", async () => {
    expect(true).toBe(true);
  });
});
