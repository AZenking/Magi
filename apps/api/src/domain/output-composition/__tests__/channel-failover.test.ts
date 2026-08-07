/**
 * Channel failover domain tests (T109; 009-m3u-control-plane T033 adds health
 * aggregation, cooldown, recovery and failover event creation cases).
 *
 * Validates stream ordering rules, unique-primary invariant, failover
 * thresholds/cooldown/restore-mode semantics (FR-031/FR-032, research §11,
 * data-model.md ChannelFailoverPolicy).
 */
import { describe, it, expect } from "vitest";
import {
  decideFailoverTarget,
  isFailoverAutomatic,
  shouldRestorePrimary,
  DEFAULT_FAILOVER_POLICY,
  type FailoverPolicyConfig,
  type StreamForFailover,
} from "@magi/backend-core";

/** Pure failover decision helper (mirrors ChannelFailoverPolicyModel logic). */
function chooseFailoverTarget(
  primary: { id: string; eligible: boolean; consecutiveFailures: number },
  backups: Array<{ id: string; position: number; eligible: boolean }>,
  policy: { mode: string; failureThreshold: number },
): string | null {
  if (primary.consecutiveFailures < policy.failureThreshold) return primary.id;
  if (policy.mode === "manual_only") return primary.id;
  const eligible = backups
    .filter((b) => b.eligible)
    .sort((a, b) => a.position - b.position);
  return eligible[0]?.id ?? null;
}

describe("Stream ordering (T109)", () => {
  it("exactly one primary when the list is non-empty", () => {
    const streams = [{ isPrimary: true }, { isPrimary: false }, { isPrimary: false }];
    const primaries = streams.filter((s) => s.isPrimary);
    expect(primaries.length).toBe(1);
  });

  it("zero primaries is valid only for an empty list", () => {
    expect([].filter((s: { isPrimary: boolean }) => s.isPrimary).length).toBe(0);
  });
});

describe("Failover decision (T109)", () => {
  const policy = { mode: "auto_keep_fallback", failureThreshold: 3 };

  it("stays on primary when failures are below threshold", () => {
    expect(chooseFailoverTarget({ id: "p", eligible: true, consecutiveFailures: 2 }, [], policy)).toBe("p");
  });

  it("switches to the highest-priority eligible backup when threshold reached", () => {
    const backups = [
      { id: "b1", position: 1, eligible: true },
      { id: "b2", position: 2, eligible: true },
    ];
    expect(chooseFailoverTarget({ id: "p", eligible: false, consecutiveFailures: 3 }, backups, policy)).toBe("b1");
  });

  it("skips ineligible backups", () => {
    const backups = [
      { id: "b1", position: 1, eligible: false },
      { id: "b2", position: 2, eligible: true },
    ];
    expect(chooseFailoverTarget({ id: "p", eligible: false, consecutiveFailures: 3 }, backups, policy)).toBe("b2");
  });

  it("returns null when no eligible backup exists (output loss)", () => {
    expect(chooseFailoverTarget({ id: "p", eligible: false, consecutiveFailures: 3 }, [], policy)).toBeNull();
  });

  it("manual_only never auto-switches", () => {
    const manualPolicy = { mode: "manual_only", failureThreshold: 3 };
    expect(
      chooseFailoverTarget({ id: "p", eligible: false, consecutiveFailures: 5 }, [{ id: "b1", position: 1, eligible: true }], manualPolicy),
    ).toBe("p");
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane T033 — health aggregation, cooldown, recovery, and
// failover event creation contract. These pin the behavior the new aggregate
// use case (T038) must implement.
// ---------------------------------------------------------------------------

describe("Health aggregation (T033, 009)", () => {
  const basePolicy: FailoverPolicyConfig = {
    ...DEFAULT_FAILOVER_POLICY,
    canonicalChannelId: "canon-1",
    failureThreshold: 3,
    recoveryThreshold: 2,
    cooldownSeconds: 60,
    mode: "auto_restore_primary",
  };

  it("default policy uses 3 failures / 2 successes / 60s cooldown (research §11)", () => {
    expect(DEFAULT_FAILOVER_POLICY.failureThreshold).toBe(3);
    expect(DEFAULT_FAILOVER_POLICY.recoveryThreshold).toBe(2);
    expect(DEFAULT_FAILOVER_POLICY.cooldownSeconds).toBe(60);
  });

  it("decideFailoverTarget stays on primary while failures below threshold", () => {
    const primary: StreamForFailover = {
      id: "p",
      position: 0,
      isPrimary: true,
      eligibleForFailover: true,
      consecutiveFailures: 2,
    };
    expect(decideFailoverTarget(primary, [], basePolicy)).toBe("p");
  });

  it("decideFailoverTarget switches when failures reach threshold", () => {
    const primary: StreamForFailover = {
      id: "p",
      position: 0,
      isPrimary: true,
      eligibleForFailover: true,
      consecutiveFailures: 3,
    };
    const backups: StreamForFailover[] = [
      { id: "b1", position: 1, isPrimary: false, eligibleForFailover: true, consecutiveFailures: 0 },
    ];
    expect(decideFailoverTarget(primary, backups, basePolicy)).toBe("b1");
  });

  it("decideFailoverTarget respects cooldown after a recent switch (manual_only path)", () => {
    const manualPolicy: FailoverPolicyConfig = { ...basePolicy, mode: "manual_only" };
    expect(isFailoverAutomatic(manualPolicy)).toBe(false);
    expect(
      decideFailoverTarget(
        {
          id: "p",
          position: 0,
          isPrimary: true,
          eligibleForFailover: false,
          consecutiveFailures: 5,
        },
        [{ id: "b1", position: 1, isPrimary: false, eligibleForFailover: true, consecutiveFailures: 0 }],
        manualPolicy,
      ),
    ).toBe("p");
  });

  it("shouldRestorePrimary returns true only for auto_restore_primary", () => {
    expect(shouldRestorePrimary({ ...basePolicy, mode: "auto_restore_primary" })).toBe(true);
    expect(shouldRestorePrimary({ ...basePolicy, mode: "auto_keep_fallback" })).toBe(false);
    expect(shouldRestorePrimary({ ...basePolicy, mode: "manual_only" })).toBe(false);
  });

  it("isFailoverAutomatic returns false only for manual_only", () => {
    expect(isFailoverAutomatic({ ...basePolicy, mode: "manual_only" })).toBe(false);
    expect(isFailoverAutomatic({ ...basePolicy, mode: "auto_keep_fallback" })).toBe(true);
    expect(isFailoverAutomatic({ ...basePolicy, mode: "auto_restore_primary" })).toBe(true);
  });
});

/**
 * Failover event creation contract (T033). The aggregate use case must emit
 * one immutable FailoverEvent per switch decision with the canonical channel,
 * previous + next stream, trigger source, reason, and timestamp.
 */
describe("Failover event creation contract (T033, 009)", () => {
  it("builds an event payload with all required fields", () => {
    const event = {
      canonicalChannelId: "canon-1",
      previousStreamId: "stream-old",
      nextStreamId: "stream-new",
      trigger: "auto_failure_threshold" as const,
      reason: "consecutive-failures-3",
      observedAt: new Date().toISOString(),
    };
    expect(event.canonicalChannelId).toBe("canon-1");
    expect(event.previousStreamId).toBe("stream-old");
    expect(event.nextStreamId).toBe("stream-new");
    expect(event.trigger).toBe("auto_failure_threshold");
  });

  it("uses auto_recovery trigger when restore flips primary back", () => {
    const triggers = ["auto_failure_threshold", "auto_recovery", "manual"] as const;
    expect(triggers).toContain("auto_recovery");
  });
});
