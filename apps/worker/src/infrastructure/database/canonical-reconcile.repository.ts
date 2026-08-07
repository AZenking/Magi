/**
 * Drizzle adapter for ICanonicalReconcileRepository (008-pipeline-reliability T005;
 * 009-m3u-control-plane T025 adds findCanonicalByNormalizedTvgId,
 * insertWeakMatchCandidate, isCandidateSuppressed, listCanonicalsForWeakMatch).
 *
 * Provides canonical channel membership operations using channelIdentity (stable
 * string) as the membership key, so that canonical mappings survive channel UUID
 * changes during M3U re-sync.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import {
  canonicalChannelMembers,
  canonicalChannels,
  channels,
  mergeCandidates,
} from "../../schema";
import { normalizeTvgId, normalizeName } from "@magi/backend-core";
import type {
  ICanonicalReconcileRepository,
  CanonicalMemberInput,
  WeakMatchCandidateInput,
} from "@/domain/source-sync/canonical-reconcile.repository";

export class DrizzleCanonicalReconcileRepository implements ICanonicalReconcileRepository {
  async findMembership(sourceChannelId: string): Promise<{ canonicalChannelId: string } | null> {
    const rows = await db
      .select({ canonicalChannelId: canonicalChannelMembers.canonicalChannelId })
      .from(canonicalChannelMembers)
      .where(
        and(
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
          eq(canonicalChannelMembers.active, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertMembership(
    canonicalChannelId: string,
    member: CanonicalMemberInput,
    source: "automatic" | "manual" | "migrated" = "automatic",
  ): Promise<void> {
    await db
      .insert(canonicalChannelMembers)
      .values({
        canonicalChannelId,
        sourceChannelId: member.sourceChannelId,
        channelIdentity: member.channelIdentity,
        membershipSource: source,
        active: true,
        joinedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [canonicalChannelMembers.canonicalChannelId, canonicalChannelMembers.sourceChannelId],
        set: {
          active: true,
          leftAt: null,
          channelIdentity: member.channelIdentity,
          membershipSource: source,
        },
      });
  }

  async createCanonicalFromSource(sourceChannelId: string, displayName: string): Promise<{ canonicalChannelId: string }> {
    const [row] = await db
      .insert(canonicalChannels)
      .values({
        standardName: displayName,
        outputStatus: "active",
      })
      .returning({ id: canonicalChannels.id });
    return { canonicalChannelId: row!.id };
  }

  async deactivateMembership(canonicalChannelId: string, sourceChannelId: string): Promise<void> {
    await db
      .update(canonicalChannelMembers)
      .set({ active: false, leftAt: new Date() })
      .where(
        and(
          eq(canonicalChannelMembers.canonicalChannelId, canonicalChannelId),
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
        ),
      );
  }

  // -------------------------------------------------------------------------
  // 009-m3u-control-plane (T025) — tvg-id auto-merge + weak-match candidates.
  // -------------------------------------------------------------------------

  async findCanonicalByNormalizedTvgId(
    normalizedTvgId: string,
  ): Promise<{ canonicalChannelId: string } | null> {
    // Resolve via active members: pull each member's source channel tvgId and
    // normalize. The first member whose normalized tvg-id matches returns its
    // canonical.
    const members = await db
      .select({
        canonicalChannelId: canonicalChannelMembers.canonicalChannelId,
        sourceChannelId: canonicalChannelMembers.sourceChannelId,
      })
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.active, true));
    if (members.length === 0) return null;

    const sourceChannelIds = new Set(members.map((m) => m.sourceChannelId));
    const sourceChannels = await db
      .select({ id: channels.id, tvgId: channels.tvgId })
      .from(channels);
    const tvgBySourceChannelId = new Map<string, string | null>();
    for (const c of sourceChannels) {
      if (c.id && sourceChannelIds.has(c.id)) {
        tvgBySourceChannelId.set(c.id, c.tvgId ?? null);
      }
    }

    for (const member of members) {
      const tvg = tvgBySourceChannelId.get(member.sourceChannelId) ?? null;
      if (normalizeTvgId(tvg) === normalizedTvgId) {
        return { canonicalChannelId: member.canonicalChannelId };
      }
    }
    return null;
  }

  async insertWeakMatchCandidate(input: WeakMatchCandidateInput): Promise<void> {
    // The merge_candidates table stores reasons as Postgres array literal.
    const reasonsLiteral = `{${input.reasons.map((r) => r.replace(/,/g, " ")).join(",")}}`;
    await db
      .insert(mergeCandidates)
      .values({
        sourceChannelId: input.sourceChannelId,
        canonicalChannelId: input.canonicalChannelId,
        method: input.method,
        reasons: reasonsLiteral,
        status: "pending",
        sourceFingerprint: input.sourceFingerprint,
        suppressionKey: input.suppressionKey,
        confidence: input.confidence,
      })
      .onConflictDoNothing({ target: [mergeCandidates.suppressionKey] });
  }

  async isCandidateSuppressed(suppressionKey: string): Promise<boolean> {
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

  async listCanonicalsForWeakMatch(): Promise<
    ReadonlyArray<{
      canonicalChannelId: string;
      normalizedName: string | null;
      normalizedGroup: string | null;
      memberSourceChannelIds: ReadonlyArray<string>;
    }>
  > {
    const canonicalRows = await db
      .select({
        id: canonicalChannels.id,
        standardName: canonicalChannels.standardName,
        standardGroup: canonicalChannels.standardGroup,
      })
      .from(canonicalChannels);
    const memberRows = await db
      .select({
        canonicalChannelId: canonicalChannelMembers.canonicalChannelId,
        sourceChannelId: canonicalChannelMembers.sourceChannelId,
      })
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.active, true));

    return canonicalRows.map((c) => ({
      canonicalChannelId: c.id,
      normalizedName: normalizeName(c.standardName),
      normalizedGroup: normalizeName(c.standardGroup ?? null),
      memberSourceChannelIds: memberRows
        .filter((m) => m.canonicalChannelId === c.id)
        .map((m) => m.sourceChannelId),
    }));
  }
}
