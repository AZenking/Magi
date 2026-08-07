/**
 * Drizzle implementation of IMergeCandidateRepository (T009, 009).
 *
 * Stores weak-signal composition candidates produced by the reconcile use
 * case. Same-tvg-id pairs never appear here — they auto-merge. Rejected
 * candidates store a `suppressionKey` so subsequent runs of the same source
 * fingerprint won't re-suggest the same pairing.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./connection";
import { mergeCandidates } from "./schema";
import type {
  IMergeCandidateRepository,
  MergeCandidateFilters,
} from "@/domain/output-composition";
import type { MergeCandidateVo } from "@magi/types";

function toVo(row: typeof mergeCandidates.$inferSelect): MergeCandidateVo {
  return {
    id: row.id,
    sourceChannelId: row.sourceChannelId,
    canonicalChannelId: row.canonicalChannelId,
    method: row.method as MergeCandidateVo["method"],
    reasons: parseReasons(row.reasons),
    status: row.status as MergeCandidateVo["status"],
    sourceFingerprint: row.sourceFingerprint,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedBy: row.reviewedBy,
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
      .select()
      .from(mergeCandidates)
      .where(where)
      .orderBy(desc(mergeCandidates.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const totalRows = where
      ? await db
          .select({ count: mergeCandidates.id })
          .from(mergeCandidates)
          .where(where)
      : await db.select({ count: mergeCandidates.id }).from(mergeCandidates);

    return {
      items: rows.map(toVo),
      total: totalRows.length,
    };
  }

  async findById(id: string): Promise<MergeCandidateVo | null> {
    const [row] = await db
      .select()
      .from(mergeCandidates)
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
    return toVo(row!);
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
    return row ? toVo(row) : null;
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
    return row ? toVo(row) : null;
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
