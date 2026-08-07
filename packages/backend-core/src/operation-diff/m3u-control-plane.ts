/**
 * Pure M3U control-plane algorithms (T005).
 *
 * Framework-independent helpers for the 009 feature:
 *   - 25%/empty anomaly classification (FR-016)
 *   - Normalized tvg-id matching for automatic composition (FR-007, Decision 3)
 *   - Weak-match candidate generation from name/group similarity
 *
 * No DB / Nest / fs imports — only TypeScript + node:crypto. The Worker and
 * API layers compose these into prepare/reconcile use cases.
 */

/** A source channel as seen by composition (after identity assignment). */
export interface CompositionSourceChannel {
  readonly sourceChannelId: string;
  readonly channelIdentity: string;
  readonly tvgId: string | null;
  readonly tvgName: string | null;
  readonly displayName: string;
  readonly groupTitle: string | null;
  readonly sourceFingerprint: string;
}

/** A canonical channel the player ultimately sees. */
export interface CompositionCanonicalChannel {
  readonly canonicalChannelId: string;
  /** Existing membership keys: `sourceChannelId`, used to suppress duplicates. */
  readonly memberSourceChannelIds: ReadonlySet<string>;
}

/** Outcome of an automatic same-tvg-id match attempt. */
export interface AutoMatchResult {
  readonly matchedCanonicalId: string | null;
  readonly reason: "tvg-id-collision" | "no-tvg-id" | "no-match";
  readonly normalizedTvgId: string | null;
}

/** A weak-signal candidate to surface for manual review. */
export interface WeakMatchCandidate {
  readonly sourceChannelId: string;
  readonly canonicalChannelId: string;
  readonly method: "normalized_name" | "normalized_name_group";
  readonly reasons: string[];
  readonly confidence: number;
}

/** Result of classifying a snapshot delta against the current present count. */
export interface AnomalyClassification {
  readonly requiresConfirmation: boolean;
  readonly warnings: AnomalyWarning[];
}

export interface AnomalyWarning {
  readonly code: "empty-snapshot" | "deletion-ratio-exceeded";
  readonly message: string;
  readonly deletionRatio: number;
}

/** Threshold above which a single sync is considered an anomaly (FR-016). */
export const DELETION_RATIO_THRESHOLD = 0.25;

/**
 * Normalize a tvg-id for stable matching. Rules (research §3):
 *   - lowercase
 *   - trim and collapse internal whitespace
 *   - strip diacritics via NFD decomposition
 *   - drop empty / whitespace-only results → null
 */
export function normalizeTvgId(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const lowered = trimmed.toLowerCase();
  const deaccented = lowered.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const collapsed = deaccented.replace(/\s+/g, " ");
  return collapsed.length === 0 ? null : collapsed;
}

/** Normalize a free-form name for weak-match comparisons. */
export function normalizeName(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return null;
  const deaccented = trimmed.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return deaccented.replace(/[\s\-_]+/g, " ");
}

/**
 * Classify a snapshot delta against the previously-present baseline.
 *
 * Rules (research §2, FR-016):
 *   - First import (currentPresent == 0) never triggers confirmation.
 *   - Empty snapshot with non-empty baseline => confirmation + empty-snapshot.
 *   - missing / currentPresent ≥ 0.25 => confirmation + deletion-ratio-exceeded.
 */
export function classifyAnomaly(input: {
  readonly snapshotItemCount: number;
  readonly currentPresentCount: number;
  readonly missingCount: number;
}): AnomalyClassification {
  const { snapshotItemCount, currentPresentCount, missingCount } = input;
  if (currentPresentCount <= 0) {
    return { requiresConfirmation: false, warnings: [] };
  }
  const warnings: AnomalyWarning[] = [];
  if (snapshotItemCount === 0) {
    warnings.push({
      code: "empty-snapshot",
      message: "snapshot is empty while source currently has entries",
      deletionRatio: 1,
    });
  }
  const deletionRatio = missingCount / currentPresentCount;
  if (missingCount > 0 && deletionRatio >= DELETION_RATIO_THRESHOLD) {
    warnings.push({
      code: "deletion-ratio-exceeded",
      message: `deletion ratio ${deletionRatio.toFixed(2)} ≥ ${DELETION_RATIO_THRESHOLD}`,
      deletionRatio,
    });
  }
  return {
    requiresConfirmation: warnings.length > 0,
    warnings,
  };
}

/**
 * Attempt automatic composition for one source channel against existing
 * canonical channels (research §3, FR-007).
 *
 * Only same non-null normalized tvg-id produces a match. The candidate's
 * source channel must NOT already be a member of the canonical (suppress
 * duplicates).
 */
export function matchAutomaticMembership(input: {
  readonly source: CompositionSourceChannel;
  readonly canonicals: readonly CompositionCanonicalChannel[];
}): AutoMatchResult {
  const normalized = normalizeTvgId(input.source.tvgId);
  if (normalized == null) {
    return { matchedCanonicalId: null, reason: "no-tvg-id", normalizedTvgId: null };
  }
  // Build a tvg-id → canonical id index from canonicals that already include a
  // member with this normalized tvg-id. The caller is responsible for keeping
  // canonicals list coherent; we just check membership here.
  for (const c of input.canonicals) {
    if (c.memberSourceChannelIds.has(input.source.sourceChannelId)) {
      // Already a member — match to itself to make the result idempotent.
      return {
        matchedCanonicalId: c.canonicalChannelId,
        reason: "tvg-id-collision",
        normalizedTvgId: normalized,
      };
    }
  }
  // No existing membership; caller (reconcile use case) is expected to also
  // pass a map of normalized tvg-id → canonicalId. We surface the normalized
  // key so the caller can do the cross-source lookup itself; the pure helper
  // here only answers "is this source channel a member?".
  return {
    matchedCanonicalId: null,
    reason: "no-match",
    normalizedTvgId: normalized,
  };
}

/**
 * Group source channels by normalized non-null tvg-id. Channels in the same
 * group should be auto-merged into one canonical channel.
 */
export function groupByNormalizedTvgId(
  sources: readonly CompositionSourceChannel[],
): ReadonlyMap<string, readonly CompositionSourceChannel[]> {
  const groups = new Map<string, CompositionSourceChannel[]>();
  for (const source of sources) {
    const normalized = normalizeTvgId(source.tvgId);
    if (normalized == null) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.push(source);
    } else {
      groups.set(normalized, [source]);
    }
  }
  return groups;
}

/**
 * Generate weak-match candidates for sources without a same-tvg-id home.
 *
 * Two strategies (data-model.md `MergeCandidate.method`):
 *   - normalized_name_group: name AND group both collapse to same value.
 *   - normalized_name: name alone matches (lower confidence).
 *
 * Same-tvg-id pairs never produce candidates — they auto-merge.
 */
export interface CanonicalWithNormalization extends CompositionCanonicalChannel {
  readonly normalizedName: string | null;
  readonly normalizedGroup: string | null;
}

export function generateWeakMatchCandidates(input: {
  readonly unmatchedSources: readonly CompositionSourceChannel[];
  readonly canonicals: readonly CanonicalWithNormalization[];
}): WeakMatchCandidate[] {
  const candidates: WeakMatchCandidate[] = [];
  for (const source of input.unmatchedSources) {
    const sourceName = normalizeName(source.displayName);
    const sourceGroup = normalizeName(source.groupTitle);
    if (sourceName == null) continue;

    for (const canonical of input.canonicals) {
      if (canonical.memberSourceChannelIds.has(source.sourceChannelId)) continue;
      const nameMatches =
        canonical.normalizedName != null && canonical.normalizedName === sourceName;
      const groupMatches =
        sourceGroup != null &&
        canonical.normalizedGroup != null &&
        canonical.normalizedGroup === sourceGroup;

      if (nameMatches && groupMatches) {
        candidates.push({
          sourceChannelId: source.sourceChannelId,
          canonicalChannelId: canonical.canonicalChannelId,
          method: "normalized_name_group",
          reasons: ["display-name-match", "group-title-match"],
          confidence: 0.7,
        });
      } else if (nameMatches) {
        candidates.push({
          sourceChannelId: source.sourceChannelId,
          canonicalChannelId: canonical.canonicalChannelId,
          method: "normalized_name",
          reasons: ["display-name-match"],
          confidence: 0.5,
        });
      }
    }
  }
  return candidates;
}

/** Build a stable source-fingerprint suppression key for rejected candidates. */
export function buildCandidateSuppressionKey(input: {
  readonly sourceFingerprint: string;
  readonly sourceChannelId: string;
  readonly canonicalChannelId: string;
  readonly method: WeakMatchCandidate["method"];
}): string {
  return [input.sourceFingerprint, input.sourceChannelId, input.canonicalChannelId, input.method].join(
    "|",
  );
}
