/**
 * Safe Operations rollout configuration (API side, T048).
 *
 * Read by the API to decide whether to run shadow previews and which sources
 * use the new preview→apply path. Defaults are SAFE (all off). Enable only
 * after the rollout runbook is reviewed.
 */
export interface SafeOperationsConfig {
  /** Run new diff/match as shadow (no apply). Phase 3. */
  readonly shadowPreview: boolean;
  /** Source IDs that use the new write path. Empty = none. Phase 4. */
  readonly enableNewWriteSourceIds: readonly string[];
  /** All sources use the new path. Phase 5. */
  readonly enableNewWriteAll: boolean;
  /** Operation lease TTL (ms). Default 2 minutes. */
  readonly leaseTtlMs: number;
  /** Lease heartbeat interval (ms). Default 30 seconds. */
  readonly leaseHeartbeatMs: number;
  /** Idempotency record retention (hours). Minimum 24. */
  readonly idempotencyRetentionHours: number;
}

function parseSourceIds(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function loadSafeOperationsConfig(): SafeOperationsConfig {
  return {
    shadowPreview: process.env.SAFE_OPS_SHADOW_PREVIEW === "true",
    enableNewWriteSourceIds: parseSourceIds(process.env.SAFE_OPS_ENABLE_NEW_WRITE_SOURCE_IDS),
    enableNewWriteAll: process.env.SAFE_OPS_ENABLE_NEW_WRITE_ALL === "true",
    leaseTtlMs: 2 * 60 * 1000,
    leaseHeartbeatMs: 30 * 1000,
    idempotencyRetentionHours: 24,
  };
}
