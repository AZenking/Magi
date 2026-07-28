/**
 * ChannelFailoverPolicy domain model (T114).
 *
 * Encapsulates failover decision logic: thresholds, cooldown, restore mode.
 * Pure — no framework/Drizzle imports (constitution III).
 */
export type FailoverMode = "manual_only" | "auto_keep_fallback" | "auto_restore_primary";

export interface FailoverPolicyData {
  readonly canonicalChannelId: string;
  mode: FailoverMode;
  failureThreshold: number;
  recoveryThreshold: number;
  cooldownSeconds: number;
  lastSwitchAt: Date | null;
  lastSwitchReason: string | null;
  version: number;
}

export interface StreamForFailover {
  readonly id: string;
  readonly position: number;
  readonly isPrimary: boolean;
  readonly eligibleForFailover: boolean;
  readonly consecutiveFailures: number;
}

export class ChannelFailoverPolicyModel {
  constructor(private readonly policy: FailoverPolicyData) {}

  /** Decide the target stream after a health event. Returns null for output loss. */
  decideTarget(primary: StreamForFailover, backups: readonly StreamForFailover[]): string | null {
    if (primary.consecutiveFailures < this.policy.failureThreshold) return primary.id;
    if (this.policy.mode === "manual_only") return primary.id;
    const eligible = backups
      .filter((b) => b.eligibleForFailover)
      .sort((a, b) => a.position - b.position);
    return eligible[0]?.id ?? null;
  }

  /** Whether the policy allows automatic switching at all. */
  isAutomatic(): boolean {
    return this.policy.mode !== "manual_only";
  }

  /** Whether primary should be restored once it recovers. */
  shouldRestorePrimary(): boolean {
    return this.policy.mode === "auto_restore_primary";
  }

  toObject(): FailoverPolicyData {
    return { ...this.policy };
  }
}
