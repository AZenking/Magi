/**
 * Fingerprint normalization (T013).
 *
 * Pure, deterministic input normalization + SHA-256 fingerprint. Used to
 * guarantee "user-reviewed content === executed content" (research §1) and to
 * detect stale previews (research §6).
 *
 * Guarantees:
 *   - same logical input => identical fingerprint (across runs, Node versions)
 *   - independent of array order (stable sort by channelIdentity)
 *   - independent of object key insertion order
 *   - undefined fields dropped; explicit nulls kept (null is meaningful)
 *   - no Math.random / Date.now / I/O — fully pure
 */
import { createHash } from "node:crypto";
import type { SnapshotItem } from "./types";

/**
 * Deterministic JSON serialization: object keys sorted alphabetically,
 * arrays preserved in order, undefined omitted, null kept.
 */
export function stableStringify(value: unknown): string {
  // Bigint-safe number check omitted — fingerprints never serialize bigint by
  // contract (source facts are JSON-native).
  if (value === null || typeof value !== "object") {
    return value === undefined ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          stableStringify((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

/**
 * Normalize a raw input array into a canonical form: sorted by channelIdentity,
 * undefined fields stripped. Returns a new array; input is not mutated.
 */
export function normalizeInput(
  items: readonly SnapshotItem[],
): readonly SnapshotItem[] {
  return [...items]
    .map((item) => stripUndefined({ ...item, payload: stripUndefined({ ...item.payload }) }))
    .sort((a, b) =>
      a.channelIdentity < b.channelIdentity
        ? -1
        : a.channelIdentity > b.channelIdentity
          ? 1
          : 0,
    );
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Compute a stable SHA-256 fingerprint for an input array. Format:
 *   `sha256:<64-hex>`
 */
export function computeFingerprint(items: readonly SnapshotItem[]): string {
  const normalized = normalizeInput(items);
  const digest = createHash("sha256").update(stableStringify(normalized)).digest("hex");
  return `sha256:${digest}`;
}
