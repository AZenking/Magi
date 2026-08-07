/**
 * MergeCandidate (T006, feature 009-m3u-control-plane).
 *
 * Weak-signal composition candidates awaiting operator review
 * (data-model.md `MergeCandidate`). Same-tvg-id pairs never produce a
 * candidate — they auto-merge. Only name/group similarity lands here.
 *
 * Lifecycle: pending → accepted | rejected | stale.
 *  - accepted creates a manual `CanonicalChannelMember`.
 *  - rejected records a suppression key so the same input fingerprint will
 *    not re-suggest the same pairing.
 *  - stale flips when source/canonical drifts (handled by reconcile use case).
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/pg-core";

export const mergeCandidates = pgTable(
  "merge_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceChannelId: uuid("source_channel_id").notNull(),
    canonicalChannelId: uuid("canonical_channel_id"),
    method: varchar("method", { length: 40 }).notNull(), // normalized_name | normalized_name_group
    reasons: text("reasons") // array stored as text[] via dialect-agnostic string
      .notNull()
      .default("{}"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sourceFingerprint: varchar("source_fingerprint", { length: 80 }).notNull(),
    suppressionKey: varchar("suppression_key", { length: 255 }),
    confidence: real("confidence"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: varchar("reviewed_by", { length: 255 }),
    reviewNote: varchar("review_note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("merge_candidate_suppression_idx").on(t.suppressionKey),
    index("merge_candidate_status_idx").on(t.status),
    index("merge_candidate_source_idx").on(t.sourceChannelId),
    index("merge_candidate_canonical_idx").on(t.canonicalChannelId),
  ],
);
