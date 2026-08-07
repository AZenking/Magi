/**
 * operation-diff barrel (T014).
 *
 * Pure source-diff and fingerprint algorithms shared by API and Worker.
 * No Drizzle / BullMQ / NestJS / fs imports — constitution III.
 */
export { computeFingerprint, normalizeInput, stableStringify } from "./fingerprint";
export { computeChangeItems, summarize } from "./diff-engine";
export * from "./types";

// 009-m3u-control-plane pure helpers (T005).
export {
  DELETION_RATIO_THRESHOLD,
  buildCandidateSuppressionKey,
  classifyAnomaly,
  generateWeakMatchCandidates,
  groupByNormalizedTvgId,
  matchAutomaticMembership,
  normalizeName,
  normalizeTvgId,
} from "./m3u-control-plane";
export type {
  AnomalyClassification,
  AnomalyWarning,
  AutoMatchResult,
  CompositionCanonicalChannel,
  CompositionSourceChannel,
  WeakMatchCandidate,
} from "./m3u-control-plane";
