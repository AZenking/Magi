/**
 * ChannelFailoverPolicy domain model (T114).
 *
 * Encapsulates failover decision logic: thresholds, cooldown, restore mode.
 * Pure — no framework/Drizzle imports (constitution III).
 *
 * Decision logic delegates to the shared pure function in @magi/backend-core
 * (008-pipeline-reliability T001) so the Worker can reuse the exact same logic.
 */
import {
  decideFailoverTarget,
  isFailoverAutomatic,
  shouldRestorePrimary,
} from "@magi/backend-core";

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
    return decideFailoverTarget(primary, backups, this.policy);
  }

  /** Whether the policy allows automatic switching at all. */
  isAutomatic(): boolean {
    return isFailoverAutomatic(this.policy);
  }

  /** Whether primary should be restored once it recovers. */
  shouldRestorePrimary(): boolean {
    return shouldRestorePrimary(this.policy);
  }

  toObject(): FailoverPolicyData {
    return { ...this.policy };
  }
}
