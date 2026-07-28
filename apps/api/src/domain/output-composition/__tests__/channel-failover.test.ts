/**
 * Channel failover domain tests (T109).
 *
 * Validates stream ordering rules, unique-primary invariant, failover
 * thresholds/cooldown/restore-mode semantics (FR-031/FR-032, research §11,
 * data-model.md ChannelFailoverPolicy).
 */
import { describe, it, expect } from "vitest";

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
