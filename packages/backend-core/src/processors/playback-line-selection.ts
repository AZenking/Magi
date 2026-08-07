/**
 * Shared line-selection ordering (009-m3u-control-plane T036/T041).
 *
 * One pure helper used by:
 *   - apps/api/.../generate-m3u-output.use-case.ts (v1 M3U)
 *   - apps/api/.../generate-v2-output.use-cases.ts (v2 M3U)
 *   - apps/api/.../resolve-playback.use-case.ts (Open playback decision)
 *
 * Rules (research §11, data-model.md `ChannelStream`):
 *   1. Manual streams always survive source missing-retention.
 *   2. Source streams with `missingSince != null` sink to the bottom.
 *   3. Within the surviving set, primary wins on tie; otherwise order by:
 *      health (online > unknown > degraded > offline) → successRate desc →
 *      position asc → responseTime asc.
 *   4. Empty input returns null (caller signals "no playable line").
 *
 * This function is pure: no side effects, no I/O. Same input always yields
 * the same selected stream.
 */

export type PlaybackLineHealth = "online" | "offline" | "degraded" | "unknown";

export interface PlaybackLine {
  readonly id: string;
  readonly isPrimary: boolean;
  readonly position: number;
  readonly eligibleForFailover: boolean;
  readonly healthStatus: PlaybackLineHealth;
  readonly responseTime: number | null;
  readonly successRate: number | null;
  readonly consecutiveFailures: number;
  readonly origin: "source" | "manual";
  readonly missingSince: Date | null;
}

const HEALTH_RANK: Record<PlaybackLineHealth, number> = {
  online: 0,
  unknown: 1,
  degraded: 2,
  offline: 3,
};

/**
 * Returns the best playback line for a channel, or null when no line is
 * eligible (empty input, or all source lines missing with no manual line).
 */
export function selectPlaybackLine(
  lines: readonly PlaybackLine[],
): PlaybackLine | null {
  if (lines.length === 0) return null;
  const sorted = [...lines].sort(comparePlaybackLines);
  return sorted[0] ?? null;
}

/**
 * Comparison function — exposed so callers can sort the full set (e.g. to
 * produce a fallback chain) using the exact same logic.
 */
export function comparePlaybackLines(
  a: PlaybackLine,
  b: PlaybackLine,
): number {
  // 1. Manual survival — manual lines always rank above missing source lines.
  const aMissing = a.origin !== "manual" && a.missingSince != null ? 1 : 0;
  const bMissing = b.origin !== "manual" && b.missingSince != null ? 1 : 0;
  if (aMissing !== bMissing) return aMissing - bMissing;

  // 2. Health.
  const aHealth = HEALTH_RANK[a.healthStatus] ?? 99;
  const bHealth = HEALTH_RANK[b.healthStatus] ?? 99;
  if (aHealth !== bHealth) return aHealth - bHealth;

  // 3. Primary first on tie.
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;

  // 4. Position ascending.
  if (a.position !== b.position) return a.position - b.position;

  // 5. successRate descending.
  const aRate = a.successRate ?? -1;
  const bRate = b.successRate ?? -1;
  if (aRate !== bRate) return bRate - aRate;

  // 6. responseTime ascending.
  const aTime = a.responseTime ?? Number.POSITIVE_INFINITY;
  const bTime = b.responseTime ?? Number.POSITIVE_INFINITY;
  return aTime - bTime;
}
