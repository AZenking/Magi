/**
 * operation-diff barrel (T014).
 *
 * Pure source-diff and fingerprint algorithms shared by API and Worker.
 * No Drizzle / BullMQ / NestJS / fs imports — constitution III.
 */
export { computeFingerprint, normalizeInput, stableStringify } from "./fingerprint";
export { computeChangeItems, summarize } from "./diff-engine";
export * from "./types";
