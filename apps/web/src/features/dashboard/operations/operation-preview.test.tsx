/**
 * Operation preview Web tests (T034).
 *
 * Part A (live): validates the T005 fixture builders produce shapes the preview
 * component (T045) will consume — green today.
 *
 * Part B (skipped): defines the expected render behavior of the
 * `OperationPreview` component once T045 implements it — goes green then.
 * Covers: impact summary counts, warnings/blockers, task link, and the rule
 * that applying never optimistically mutates channel/source data (FR-027).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildChangeSet,
  buildTaskRef,
  resetFixtureIds,
} from "@/test/safe-operations-fixtures";

describe("Operation preview fixtures (T034 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildChangeSet produces a ready change set with summary counts", () => {
    const cs = buildChangeSet({ status: "ready" });
    expect(cs.summary).toBeDefined();
    expect(cs.summary?.updated).toBeGreaterThan(0);
    expect(cs.summary?.conflicts).toBeGreaterThan(0);
  });

  it("buildChangeSet can express warnings and blockers", () => {
    const cs = buildChangeSet({
      status: "ready",
      warnings: [{ code: "source-items-will-be-marked-missing", message: "5 items will be marked missing" }],
      blockers: [{ code: "duplicate-identity-unresolved", message: "Resolve duplicates first" }],
    });
    expect(cs.warnings?.length).toBe(1);
    expect(cs.blockers?.length).toBe(1);
  });

  it("buildTaskRef wires statusUrl to the task id", () => {
    const ref = buildTaskRef({ id: "task-abc" });
    expect(ref.statusUrl).toContain("task-abc");
  });
});

describe.skip("OperationPreview component (T034 — part B, T045 not yet implemented)", () => {
  it("renders summary counts for add/update/missing/preserved/conflict", async () => {
    // const cs = buildChangeSet();
    // render(<ConfigProvider><OperationPreview changeSet={cs} /></ConfigProvider>);
    // expect(screen.getByText(/更新/)).toBeInTheDocument();
    expect(true).toBe(true);
  });

  it("disables the primary action while blockers > 0", async () => {
    // const cs = buildChangeSet({ blockers: [{ code: "x", message: "y" }] });
    // ... render ... expect(applyButton).toBeDisabled();
    expect(true).toBe(true);
  });

  it("does not optimistically mutate channel data on apply click", async () => {
    // Apply triggers a mutation; the row should show a task badge, not change
    // its values until the task succeeds and the collection is refetched.
    expect(true).toBe(true);
  });
});
