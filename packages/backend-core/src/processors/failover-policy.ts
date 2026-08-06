/**
 * Pure failover decision logic, shared between API (NestJS use case) and
 * Worker (plain function processor). No framework imports (constitution III).
 *
 * Extracted from ChannelFailoverPolicyModel so the Worker — which is not a
 * NestJS app — can reuse the exact same decision logic without importing the
 * API domain model.
 */

export type FailoverMode = "manual_only" | "auto_keep_fallback" | "auto_restore_primary";

export interface FailoverPolicyConfig {
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

/** Default policy applied when no explicit configuration exists. */
export const DEFAULT_FAILOVER_POLICY: FailoverPolicyConfig = {
  canonicalChannelId: "",
  mode: "auto_keep_fallback",
  failureThreshold: 3,
  recoveryThreshold: 2,
  cooldownSeconds: 60,
  lastSwitchAt: null,
  lastSwitchReason: null,
  version: 1,
};

/**
 * Decide the target primary stream after a health event.
 *
 * Returns the streamId that should become (or remain) primary. If the current
 * primary is still below the failure threshold, it stays primary. If the
 * policy is manual_only, the current primary always stays. Otherwise the
 * best-eligible backup (by position) becomes the target.
 *
 * Returns `null` when no eligible backup exists (output loss).
 */
export function decideFailoverTarget(
  primary: StreamForFailover,
  backups: readonly StreamForFailover[],
  policy: FailoverPolicyConfig,
): string | null {
  if (primary.consecutiveFailures < policy.failureThreshold) return primary.id;
  if (policy.mode === "manual_only") return primary.id;
  const eligible = backups
    .filter((b) => b.eligibleForFailover)
    .sort((a, b) => a.position - b.position);
  return eligible[0]?.id ?? null;
}

/** Whether the policy allows automatic switching at all. */
export function isFailoverAutomatic(policy: FailoverPolicyConfig): boolean {
  return policy.mode !== "manual_only";
}

/** Whether primary should be restored once it recovers. */
export function shouldRestorePrimary(policy: FailoverPolicyConfig): boolean {
  return policy.mode === "auto_restore_primary";
}
