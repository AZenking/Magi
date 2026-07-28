/**
 * Concurrency & idempotency primitives (T009).
 *
 * ETag/If-Match + Idempotency-Key helpers for conditional writes. The wire
 * convention: mutable resources expose numeric `version`; overwrites require
 * `If-Match: "<version>"`. Non-idempotent commands require `Idempotency-Key`.
 * Mirror contracts/common.md.
 */
import { z } from "zod";

/**
 * `version` field shape embedded in every mutable resource VO. The HTTP layer
 * also emits it as `ETag: "<version>"`.
 */
export const VersionedResourceSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type VersionedResource = z.infer<typeof VersionedResourceSchema>;

/**
 * Idempotency record retention: at least 24h, deployable-extendable but never
 * shorter (constitution / assumptions / research §17).
 */
export const IDEMPOTENCY_MIN_RETENTION_HOURS = 24;

/** Validate an Idempotency-Key header value (non-empty, <= 255 chars). */
export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/, "idempotency-key must be url-safe");

/** Validate an If-Match value: `"<integer>"` per the project convention. */
export const IfMatchSchema = z
  .string()
  .regex(/^"\d+"$/, 'If-Match must be a quoted integer version, e.g. "7"')
  .transform((v) => Number.parseInt(v.slice(1, -1), 10));

/** Normalized payload fingerprint for idempotency comparison. */
export const RequestFingerprintSchema = z.string().min(1);
export type RequestFingerprint = z.infer<typeof RequestFingerprintSchema>;
