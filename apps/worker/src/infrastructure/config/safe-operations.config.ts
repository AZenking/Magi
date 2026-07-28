/**
 * Safe Operations rollout configuration (Worker side, T048).
 *
 * Mirrors the API config. The Worker reads it to decide whether to run shadow
 * previews and which sources use the new apply path. Defaults are SAFE (all off).
 */
export interface SafeOperationsWorkerConfig {
  readonly shadowPreview: boolean;
  readonly enableNewWriteSourceIds: readonly string[];
  readonly enableNewWriteAll: boolean;
  readonly leaseTtlMs: number;
  readonly leaseHeartbeatMs: number;
}

function parseSourceIds(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function loadSafeOperationsWorkerConfig(): SafeOperationsWorkerConfig {
  return {
    shadowPreview: process.env.SAFE_OPS_SHADOW_PREVIEW === "true",
    enableNewWriteSourceIds: parseSourceIds(process.env.SAFE_OPS_ENABLE_NEW_WRITE_SOURCE_IDS),
    enableNewWriteAll: process.env.SAFE_OPS_ENABLE_NEW_WRITE_ALL === "true",
    leaseTtlMs: 2 * 60 * 1000,
    leaseHeartbeatMs: 30 * 1000,
  };
}
