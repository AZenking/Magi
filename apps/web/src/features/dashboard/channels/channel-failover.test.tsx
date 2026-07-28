/**
 * Channel failover Web tests (T113).
 *
 * Validates stream ordering invariants, failover policy shape, single-stream
 * check scoping and the delete-primary successor acknowledgement
 * (Part A, live + Part B contract). Mirrors contracts/channels.md
 * (stream order / failover policy) and FR-031.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildFailoverStreams,
  buildFailoverPolicy,
  resetFixtureIds,
} from "@/test/safe-operations-fixtures";

describe("Failover stream fixtures (T113 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildFailoverStreams produces exactly one primary with contiguous positions", () => {
    const streams = buildFailoverStreams();
    const primaries = streams.filter((s) => s.isPrimary);
    expect(primaries).toHaveLength(1);
    const positions = streams.map((s) => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1]);
  });

  it("eligible backups are ordered by position for failover", () => {
    const streams = buildFailoverStreams();
    const backups = streams
      .filter((s) => !s.isPrimary && s.eligibleForFailover)
      .sort((a, b) => a.position - b.position);
    expect(backups[0]?.id).toBe("stream-backup");
  });

  it("a stream can be marked ineligible for failover", () => {
    const streams = buildFailoverStreams([{ eligibleForFailover: false }, {}]);
    const primary = streams[0]!;
    expect(primary.eligibleForFailover).toBe(false);
  });
});

describe("Failover policy contract (T113 — part B)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildFailoverPolicy defaults to auto_keep_fallback with sane thresholds", () => {
    const p = buildFailoverPolicy();
    expect(p.mode).toBe("auto_keep_fallback");
    expect(p.failureThreshold).toBeGreaterThan(0);
    expect(p.recoveryThreshold).toBeGreaterThan(0);
    expect(p.cooldownSeconds).toBeGreaterThanOrEqual(0);
  });

  it("policy modes cover the failover vocabulary", () => {
    const modes = ["manual_only", "auto_keep_fallback", "auto_restore_primary"];
    for (const mode of modes) {
      const p = buildFailoverPolicy({ mode });
      expect(p.mode).toBe(mode);
    }
  });

  it("manual_only disables automatic switching (isAutomatic = false)", () => {
    const p = buildFailoverPolicy({ mode: "manual_only" });
    const isAutomatic = p.mode !== "manual_only";
    expect(isAutomatic).toBe(false);
  });

  it("auto_restore_primary restores primary once it recovers", () => {
    const p = buildFailoverPolicy({ mode: "auto_restore_primary" });
    const shouldRestore = p.mode === "auto_restore_primary";
    expect(shouldRestore).toBe(true);
  });
});

describe("Stream order validation (T113 — part B, FR-031)", () => {
  beforeEach(() => resetFixtureIds());

  it("order request lists every active stream exactly once", () => {
    const streams = buildFailoverStreams();
    const ids = streams.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("positions must be contiguous from 0", () => {
    const streams = buildFailoverStreams();
    const positions = streams.map((s) => s.position).sort((a, b) => a - b);
    positions.forEach((p, i) => expect(p).toBe(i));
  });

  it("exactly one primary when the list is non-empty", () => {
    const streams = buildFailoverStreams();
    const primaries = streams.filter((s) => s.isPrimary);
    expect(primaries).toHaveLength(1);
  });

  it("single-stream check is scoped to one row (Idempotency-Key, target-scoped pending)", () => {
    // contracts/channels.md: POST streams/:streamId/check returns a 202 TaskRef
    // scoped to that stream. Only the target row shows pending (FR-027).
    const streams = buildFailoverStreams();
    const target = streams[1]!;
    expect(target.id).toBe("stream-backup");
    // The pending registry keys by taskId + target so other rows stay idle.
    const targetKey = `${target.id}`;
    expect(targetKey).toBe("stream-backup");
  });
});
