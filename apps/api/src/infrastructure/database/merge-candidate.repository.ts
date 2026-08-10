/**
 * Drizzle implementation of IMergeCandidateRepository (T009, 009).
 *
 * Stores weak-signal composition candidates produced by the reconcile use
 * case. Same-tvg-id pairs never appear here — they auto-merge. Rejected
 * candidates store a `suppressionKey` so subsequent runs of the same source
 * fingerprint won't re-suggest the same pairing.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./connection";
import { mergeCandidates, channels, canonicalChannels } from "./schema";
import type {
  IMergeCandidateRepository,
  MergeCandidateFilters,
} from "@/domain/output-composition";
import type { MergeCandidateVo } from "@magi/types";

/**
 * SELECT shape enriched with source + canonical channel details via LEFT JOIN.
 * Reused by list() and findById() so every read path returns the same VO.
 */
const enrichedSelect = {
  id: mergeCandidates.id,
  sourceChannelId: mergeCandidates.sourceChannelId,
  canonicalChannelId: mergeCandidates.canonicalChannelId,
  method: mergeCandidates.method,
  reasons: mergeCandidates.reasons,
  status: mergeCandidates.status,
  sourceFingerprint: mergeCandidates.sourceFingerprint,
  reviewedAt: mergeCandidates.reviewedAt,
  reviewedBy: mergeCandidates.reviewedBy,
  confidence: mergeCandidates.confidence,
  sourceChannelName: channels.displayName,
  sourceGroupTitle: channels.groupTitle,
  sourceTvgLogo: channels.tvgLogo,
  canonicalChannelName: canonicalChannels.standardName,
  canonicalGroupTitle: canonicalChannels.standardGroup,
} as const;

/** Runtime row type returned by the enriched SELECT (LEFT JOIN result). */
interface EnrichedRow {
  id: string;
  sourceChannelId: string;
  canonicalChannelId: string | null;
  method: string;
  reasons: string;
  status: string;
  sourceFingerprint: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  confidence: number | null;
  sourceChannelName: string | null;
  sourceGroupTitle: string | null;
  sourceTvgLogo: string | null;
  canonicalChannelName: string | null;
  canonicalGroupTitle: string | null;
}

function toVo(row: EnrichedRow): MergeCandidateVo {
  return {
    id: row.id,
    sourceChannelId: row.sourceChannelId,
    sourceChannelName: row.sourceChannelName ?? null,
    sourceGroupTitle: row.sourceGroupTitle ?? null,
    sourceTvgLogo: row.sourceTvgLogo ?? null,
    canonicalChannelId: row.canonicalChannelId,
    canonicalChannelName: row.canonicalChannelName ?? null,
    canonicalGroupTitle: row.canonicalGroupTitle ?? null,
    confidence: row.confidence ?? null,
    method: row.method as MergeCandidateVo["method"],
    reasons: parseReasons(row.reasons),
    status: row.status as MergeCandidateVo["status"],
    sourceFingerprint: row.sourceFingerprint,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedBy: row.reviewedBy,
  };
}

/**
 * Pad a raw merge_candidates row (from INSERT/UPDATE .returning()) with null
 * enrichment fields so it matches the enriched SELECT shape consumed by toVo.
 * Write paths don't JOIN — channel details are fetched on the next read.
 */
function padRow(row: typeof mergeCandidates.$inferSelect): EnrichedRow {
  return {
    id: row.id,
    sourceChannelId: row.sourceChannelId,
    canonicalChannelId: row.canonicalChannelId,
    method: row.method,
    reasons: row.reasons,
    status: row.status,
    sourceFingerprint: row.sourceFingerprint,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    confidence: row.confidence,
    sourceChannelName: null,
    sourceGroupTitle: null,
    sourceTvgLogo: null,
    canonicalChannelName: null,
    canonicalGroupTitle: null,
  };
}

function parseReasons(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    // The column default is `'{}'`; treat `{a,b}` as postgres array literal.
    const trimmed = raw.replace(/^\{|\}$/g, "");
    return trimmed === "" ? [] : trimmed.split(",").map((s) => s.trim());
  }
  return [];
}

function encodeReasons(reasons: readonly string[]): string {
  return `{${reasons.map((r) => r.replace(/,/g, " ")).join(",")}}`;
}

export class MergeCandidateRepository implements IMergeCandidateRepository {
  async list(
    filters: MergeCandidateFilters,
    params: { page: number; pageSize: number },
  ): Promise<{ items: MergeCandidateVo[]; total: number }> {
    const clauses = [];
    if (filters.status) clauses.push(eq(mergeCandidates.status, filters.status));
    if (filters.method) clauses.push(eq(mergeCandidates.method, filters.method));
    if (filters.sourceChannelId)
      clauses.push(eq(mergeCandidates.sourceChannelId, filters.sourceChannelId));
    if (filters.canonicalChannelId)
      clauses.push(eq(mergeCandidates.canonicalChannelId, filters.canonicalChannelId));
    const where = clauses.length === 0 ? undefined : and(...clauses);

    const rows = await db
      .select(enrichedSelect)
      .from(mergeCandidates)
      .leftJoin(channels, eq(mergeCandidates.sourceChannelId, channels.id))
      .leftJoin(canonicalChannels, eq(mergeCandidates.canonicalChannelId, canonicalChannels.id))
      .where(where)
      .orderBy(desc(mergeCandidates.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mergeCandidates)
      .where(where);

    return {
      items: rows.map(toVo),
      total: countRow?.count ?? 0,
    };
  }

  async findById(id: string): Promise<MergeCandidateVo | null> {
    const [row] = await db
      .select(enrichedSelect)
      .from(mergeCandidates)
      .leftJoin(channels, eq(mergeCandidates.sourceChannelId, channels.id))
      .leftJoin(canonicalChannels, eq(mergeCandidates.canonicalChannelId, canonicalChannels.id))
      .where(eq(mergeCandidates.id, id))
      .limit(1);
    return row ? toVo(row) : null;
  }

  async create(input: {
    sourceChannelId: string;
    canonicalChannelId: string | null;
    method: MergeCandidateVo["method"];
    reasons: readonly string[];
    sourceFingerprint: string;
    suppressionKey: string | null;
    confidence: number;
  }): Promise<MergeCandidateVo> {
    const [row] = await db
      .insert(mergeCandidates)
      .values({
        sourceChannelId: input.sourceChannelId,
        canonicalChannelId: input.canonicalChannelId,
        method: input.method,
        reasons: encodeReasons(input.reasons),
        status: "pending",
        sourceFingerprint: input.sourceFingerprint,
        suppressionKey: input.suppressionKey,
        confidence: input.confidence,
      })
      .returning();
    return toVo(padRow(row!));
  }

  async markAccepted(
    id: string,
    reviewedBy: string,
    note?: string,
  ): Promise<MergeCandidateVo | null> {
    const [row] = await db
      .update(mergeCandidates)
      .set({
        status: "accepted",
        reviewedAt: new Date(),
        reviewedBy,
        reviewNote: note,
      })
      .where(eq(mergeCandidates.id, id))
      .returning();
    return row ? toVo(padRow(row)) : null;
  }

  async markRejected(
    id: string,
    reviewedBy: string,
    note?: string,
  ): Promise<MergeCandidateVo | null> {
    const [row] = await db
      .update(mergeCandidates)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy,
        reviewNote: note,
      })
      .where(eq(mergeCandidates.id, id))
      .returning();
    return row ? toVo(padRow(row)) : null;
  }

  async markStale(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(mergeCandidates)
      .set({ status: "stale" })
      .where(
        and(
          inArray(mergeCandidates.id, [...ids]),
          eq(mergeCandidates.status, "pending"),
        ),
      )
      .returning({ id: mergeCandidates.id });
    return result.length;
  }

  async markAcceptedBatch(
    ids: readonly string[],
    reviewedBy: string,
    note?: string,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(mergeCandidates)
      .set({
        status: "accepted",
        reviewedAt: new Date(),
        reviewedBy,
        reviewNote: note,
      })
      .where(
        and(
          inArray(mergeCandidates.id, [...ids]),
          eq(mergeCandidates.status, "pending"),
        ),
      )
      .returning({ id: mergeCandidates.id });
    return result.length;
  }

  async markRejectedBatch(
    ids: readonly string[],
    reviewedBy: string,
    note?: string,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(mergeCandidates)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy,
        reviewNote: note,
      })
      .where(
        and(
          inArray(mergeCandidates.id, [...ids]),
          eq(mergeCandidates.status, "pending"),
        ),
      )
      .returning({ id: mergeCandidates.id });
    return result.length;
  }

  async isSuppressed(suppressionKey: string): Promise<boolean> {
    const [row] = await db
      .select({ id: mergeCandidates.id })
      .from(mergeCandidates)
      .where(
        and(
          eq(mergeCandidates.suppressionKey, suppressionKey),
          eq(mergeCandidates.status, "rejected"),
        ),
      )
      .limit(1);
    return row != null;
  }
}
