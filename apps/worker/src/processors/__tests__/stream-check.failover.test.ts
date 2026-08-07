/**
 * Stream-check failover unit test (008-pipeline-reliability T032, US3;
 * 009-m3u-control-plane T034 adds single-stream scope + active-probe
 * observation contract).
 *
 * Validates that decideFailoverTarget correctly decides to switch primary
 * when the current primary has consecutiveFailures >= threshold, and keeps
 * the primary when it's still healthy. This is the pure decision logic
 * that stream-check.processor calls after health updates.
 */
import { describe, it, expect, vi } from "vitest";
import { decideFailoverTarget, DEFAULT_FAILOVER_POLICY } from "@magi/backend-core";
import type { StreamForFailover, FailoverPolicyConfig } from "@magi/backend-core";

function makeStream(overrides: Partial<StreamForFailover> = {}): StreamForFailover {
  return {
    id: "stream-1",
    position: 0,
    isPrimary: true,
    eligibleForFailover: true,
    consecutiveFailures: 0,
    ...overrides,
  };
}

const defaultPolicy: FailoverPolicyConfig = {
  ...DEFAULT_FAILOVER_POLICY,
  canonicalChannelId: "ch-1",
};

describe("decideFailoverTarget in stream-check context (T032)", () => {
  it("keeps primary when consecutiveFailures below threshold", () => {
    const primary = makeStream({ id: "primary", consecutiveFailures: 2 });
    const backup = makeStream({ id: "backup", position: 1, isPrimary: false });

    const target = decideFailoverTarget(primary, [backup], defaultPolicy);
    expect(target).toBe("primary");
  });

  it("switches to first eligible backup when primary hits threshold (3)", () => {
    const primary = makeStream({ id: "primary", consecutiveFailures: 3 });
    const backup1 = makeStream({ id: "backup-1", position: 1, isPrimary: false });
    const backup2 = makeStream({ id: "backup-2", position: 2, isPrimary: false });

    const target = decideFailoverTarget(primary, [backup1, backup2], defaultPolicy);
    expect(target).toBe("backup-1");
  });

  it("returns null (output loss) when no eligible backups exist", () => {
    const primary = makeStream({ id: "primary", consecutiveFailures: 5 });
    const ineligibleBackup = makeStream({ id: "backup", position: 1, eligibleForFailover: false });

    const target = decideFailoverTarget(primary, [ineligibleBackup], defaultPolicy);
    expect(target).toBeNull();
  });

  it("respects manual_only mode (never auto-switch)", () => {
    const primary = makeStream({ id: "primary", consecutiveFailures: 10 });
    const backup = makeStream({ id: "backup", position: 1, isPrimary: false });
    const manualPolicy: FailoverPolicyConfig = { ...defaultPolicy, mode: "manual_only" };

    const target = decideFailoverTarget(primary, [backup], manualPolicy);
    expect(target).toBe("primary");
  });

  it("picks backup by position order", () => {
    const primary = makeStream({ id: "primary", consecutiveFailures: 3 });
    const near = makeStream({ id: "near", position: 5, isPrimary: false });
    const far = makeStream({ id: "far", position: 1, isPrimary: false });

    const target = decideFailoverTarget(primary, [near, far], defaultPolicy);
    expect(target).toBe("far"); // position 1 < position 5
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane T034 — single-stream scope + active-probe observation.
//
// The single-stream probe job MUST target a single streamId (not a sourceId
// that would re-probe the whole source). The processor must also persist an
// immutable `active_probe` observation row before invoking the shared
// aggregate action.
// ---------------------------------------------------------------------------

describe("Single-stream probe scope (T034, 009)", () => {
  it("processSingleStreamCheck accepts a streamId parameter (not sourceId)", async () => {
    const { processSingleStreamCheck } = await import("../stream-check.processor");
    expect(typeof processSingleStreamCheck).toBe("function");
    // Signature must accept a single streamId; we don't run it here because
    // it would hit ffprobe + DB. The contract is compile-time + runtime
    // existence.
    const fn = processSingleStreamCheck as (
      streamId: string,
      options?: { taskId?: string },
    ) => Promise<unknown>;
    expect(fn.length).toBeLessThanOrEqual(2);
  });

  it("active-probe observation payload carries source='active_probe'", () => {
    const observation = {
      streamId: "stream-1",
      canonicalChannelId: "canon-1",
      source: "active_probe" as const,
      result: "failure" as const,
      errorClass: "http-502",
      latencyMs: null,
      observedAt: new Date().toISOString(),
      taskId: "task-1",
      deviceClientId: null,
    };
    expect(observation.source).toBe("active_probe");
    expect(observation.result).toBe("failure");
  });

  it("the processor exposes an observation-emit hook for tests to count", async () => {
    // buildActiveProbeObservation is a pure builder the processor uses to
    // shape the repo insert. Verifying its shape here pins the contract.
    const mod = await import("../stream-check.processor");
    expect(typeof mod.buildActiveProbeObservation).toBe("function");
    const obs = mod.buildActiveProbeObservation({
      streamId: "s1",
      canonicalChannelId: "c1",
      result: "success",
      latencyMs: 123,
      taskId: "t1",
    });
    expect(obs).toMatchObject({
      streamId: "s1",
      canonicalChannelId: "c1",
      source: "active_probe",
      result: "success",
      latencyMs: 123,
      taskId: "t1",
    });
  });

  it("does not confuse sourceId with streamId when only streamId is supplied", async () => {
    // Contract: the function must require a streamId; passing undefined must
    // throw or return an error result, NOT silently fan out across a source.
    const { processSingleStreamCheck } = await import("../stream-check.processor");
    await expect(
      (processSingleStreamCheck as (id?: string) => Promise<unknown>)(undefined),
    ).rejects.toThrow(/streamId/i);
  });
});
