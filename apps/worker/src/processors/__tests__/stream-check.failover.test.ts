/**
 * Stream-check failover unit test (008-pipeline-reliability T032, US3).
 *
 * Validates that decideFailoverTarget correctly decides to switch primary
 * when the current primary has consecutiveFailures >= threshold, and keeps
 * the primary when it's still healthy. This is the pure decision logic
 * that stream-check.processor calls after health updates.
 */
import { describe, it, expect } from "vitest";
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
