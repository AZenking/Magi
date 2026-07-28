/**
 * Diff engine classification tests (T012) — RED phase.
 *
 * These fail until T013 implements `computeChangeItems` + `summarize`.
 * Properties under test (research §2, §4; FR-003/FR-004):
 *   - add / update / mark_missing / preserve / conflict classification
 *   - manual operator fields are always preserved (SC-001)
 *   - duplicate channelIdentity becomes a conflict, never auto-applied
 *   - summary counts are exhaustive and non-overlapping
 */
import { describe, it, expect } from "vitest";
import { computeChangeItems, summarize } from "../diff-engine";
import type { SnapshotItem, CurrentChannelState } from "../types";

const snap = (
  channelIdentity: string,
  name: string,
  extraPayload: Record<string, unknown> = {},
): SnapshotItem => ({
  channelIdentity,
  payload: { name, ...extraPayload },
});

const cur = (
  channelIdentity: string,
  overrides: Partial<CurrentChannelState> = {},
): CurrentChannelState => ({
  channelIdentity,
  automaticName: overrides.automaticName ?? "old",
  manualName: overrides.manualName ?? null,
  manualGroup: overrides.manualGroup ?? null,
  lifecycle: overrides.lifecycle ?? "active",
  manualEpgLocked: overrides.manualEpgLocked ?? false,
  primaryStreamId: overrides.primaryStreamId ?? null,
  ...overrides,
});

describe("computeChangeItems classification (T012)", () => {
  it("classifies a brand-new identity as `add`", () => {
    const items = computeChangeItems(
      [snap("id:new", "New Channel")],
      [], // nothing current
    );
    expect(items[0]?.action).toBe("add");
    expect(items[0]?.selected).toBe(true);
  });

  it("classifies a changed automatic field as `update`", () => {
    const items = computeChangeItems(
      [snap("id:1", "Renamed")],
      [cur("id:1", { automaticName: "Old Name" })],
    );
    expect(items[0]?.action).toBe("update");
  });

  it("classifies a missing identity as `mark_missing`", () => {
    const items = computeChangeItems([], [cur("id:gone")]);
    expect(items[0]?.action).toBe("mark_missing");
  });

  it("preserves manual fields even when source tries to change them (SC-001)", () => {
    const items = computeChangeItems(
      [snap("id:1", "Source Name")],
      [cur("id:1", { automaticName: "Auto", manualName: "Operator Set" })],
    );
    // Manual name wins — the change item must NOT mutate the manual value.
    const preserve = items.find((i) => i.action === "preserve");
    expect(preserve).toBeDefined();
    expect(items.find((i) => i.action === "update" && i.changedFields?.includes("name"))).toBeUndefined();
  });

  it("classifies duplicate channelIdentity in a snapshot as `conflict`", () => {
    const items = computeChangeItems([snap("id:dup", "A"), snap("id:dup", "B")], []);
    const conflicts = items.filter((i) => i.action === "conflict");
    expect(conflicts.length).toBe(2);
    expect(conflicts.every((c) => c.selected === false)).toBe(true);
  });

  it("preserves manual EPG lock: source cannot overwrite a locked binding", () => {
    const items = computeChangeItems(
      [snap("id:1", "A", { epgChannelId: "auto-candidate" })],
      [cur("id:1", { manualEpgLocked: true })],
    );
    expect(items.some((i) => i.action === "preserve")).toBe(true);
  });
});

describe("summarize (T012)", () => {
  it("aggregates counts exhaustively from change items", () => {
    const items = computeChangeItems(
      [
        snap("id:add", "New"),
        snap("id:upd", "Changed"),
        snap("id:dup", "A"),
        snap("id:dup", "B"),
      ],
      [cur("id:upd", { automaticName: "Old" }), cur("id:gone")],
    );
    const summary = summarize(items);
    expect(summary.added).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.conflicts).toBe(2);
    expect(summary.preserved).toBeGreaterThanOrEqual(0);
  });
});
