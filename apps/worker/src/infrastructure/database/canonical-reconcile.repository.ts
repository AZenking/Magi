/**
 * Drizzle adapter for ICanonicalReconcileRepository (008-pipeline-reliability T005;
 * 009-m3u-control-plane T025 adds findCanonicalByNormalizedTvgId,
 * insertWeakMatchCandidate, isCandidateSuppressed, listCanonicalsForWeakMatch).
 *
 * Provides canonical channel membership operations using channelIdentity (stable
 * string) as the membership key, so that canonical mappings survive channel UUID
 * changes during M3U re-sync.
 */
import { eq, and, or, isNull, sql, ne } from "drizzle-orm";
import { db } from "../../db";
import {
  canonicalChannelMembers,
  canonicalChannels,
  channels,
  channelStreams,
  mergeCandidates,
} from "../../schema";
import { normalizeTvgId, normalizeName } from "@magi/backend-core";
import type {
  ICanonicalReconcileRepository,
  CanonicalMemberInput,
  WeakMatchCandidateInput,
} from "@/domain/source-sync/canonical-reconcile.repository";

type ReconcileExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DrizzleCanonicalReconcileRepository implements ICanonicalReconcileRepository {
  constructor(private readonly executor: ReconcileExecutor = db) {}

  async runInTransaction<T>(
    fn: (repo: ICanonicalReconcileRepository) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) =>
      fn(new DrizzleCanonicalReconcileRepository(tx)),
    );
  }

  async markStaleCandidates(
    inputs: ReadonlyArray<{
      sourceChannelId: string;
      sourceFingerprint: string | null;
    }>,
  ): Promise<number> {
    let staleCount = 0;
    for (const input of inputs) {
      const predicate = [
        eq(mergeCandidates.sourceChannelId, input.sourceChannelId),
        eq(mergeCandidates.status, "pending"),
        input.sourceFingerprint === null
          ? sql`true`
          : ne(mergeCandidates.sourceFingerprint, input.sourceFingerprint),
      ];
      const result = await this.executor
        .update(mergeCandidates)
        .set({ status: "stale" })
        .where(and(...predicate))
        .returning({ id: mergeCandidates.id });
      staleCount += result.length;
    }
    return staleCount;
  }

  async findMembership(sourceChannelId: string): Promise<{
    canonicalChannelId: string;
    active: boolean;
    membershipSource: string;
  } | null> {
    const rows = await this.executor
      .select({
        canonicalChannelId: canonicalChannelMembers.canonicalChannelId,
        active: canonicalChannelMembers.active,
        membershipSource: canonicalChannelMembers.membershipSource,
      })
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.sourceChannelId, sourceChannelId))
      .orderBy(sql`${canonicalChannelMembers.active} desc`)
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertMembership(
    canonicalChannelId: string,
    member: CanonicalMemberInput,
    source: "automatic" | "manual" | "migrated" = "automatic",
  ): Promise<void> {
    await this.executor
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
        target: [
          canonicalChannelMembers.canonicalChannelId,
          canonicalChannelMembers.sourceChannelId,
        ],
        set: {
          active: true,
          leftAt: null,
          channelIdentity: member.channelIdentity,
          membershipSource: source,
          version: sql`${canonicalChannelMembers.version} + 1`,
        },
      });
  }

  async createCanonicalFromSource(
    sourceChannelId: string,
    displayName: string,
    groupTitle: string | null = null,
  ): Promise<{ canonicalChannelId: string }> {
    const [row] = await this.executor
      .insert(canonicalChannels)
      .values({
        standardName: displayName,
        standardGroup: groupTitle,
        outputStatus: "active",
      })
      .returning({ id: canonicalChannels.id });
    return { canonicalChannelId: row!.id };
  }

  async deactivateMembership(
    canonicalChannelId: string,
    sourceChannelId: string,
  ): Promise<void> {
    await this.executor
      .update(canonicalChannelMembers)
      .set({
        active: false,
        leftAt: new Date(),
        version: sql`${canonicalChannelMembers.version} + 1`,
      })
      .where(
        and(
          eq(canonicalChannelMembers.canonicalChannelId, canonicalChannelId),
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
        ),
      );
  }

  async upsertSourceStream(
    canonicalChannelId: string,
    sourceChannelId: string,
    sourceId: string,
    streamUrl: string,
  ): Promise<void> {
    const sourcePredicate = and(
      eq(channelStreams.sourceChannelId, sourceChannelId),
      or(eq(channelStreams.origin, "source"), isNull(channelStreams.origin)),
    );
    const [existing] = await this.executor
      .select({ id: channelStreams.id })
      .from(channelStreams)
      .where(sourcePredicate)
      .limit(1);

    if (existing) {
      // Keep canonical assignment, primary choice, health history and manual
      // ordering intact; sync only owns URL/source/visibility facts.
      await this.executor
        .update(channelStreams)
        .set({
          canonicalChannelId,
          streamUrl,
          m3uSourceId: sourceId,
          origin: "source",
          missingSince: null,
          purgedAt: null,
          updatedAt: new Date(),
          version: sql`${channelStreams.version} + 1`,
        })
        .where(eq(channelStreams.id, existing.id));
      return;
    }

    const existingCanonicalStreams = await this.executor
      .select({ id: channelStreams.id })
      .from(channelStreams)
      .where(eq(channelStreams.canonicalChannelId, canonicalChannelId));
    const isPrimary = existingCanonicalStreams.length === 0;
    const [created] = await this.executor
      .insert(channelStreams)
      .values({
        canonicalChannelId,
        m3uSourceId: sourceId,
        sourceChannelId,
        streamUrl,
        origin: "source",
        isPrimary,
        position: existingCanonicalStreams.length,
      })
      .returning({ id: channelStreams.id });
    if (isPrimary && created) {
      await this.executor
        .update(canonicalChannels)
        .set({ primaryStreamId: created.id, updatedAt: new Date() })
        .where(eq(canonicalChannels.id, canonicalChannelId));
    }
  }

  async markSourceStreamMissing(
    sourceChannelId: string,
    now: Date,
  ): Promise<void> {
    await this.executor
      .update(channelStreams)
      .set({
        missingSince: now,
        purgedAt: null,
        updatedAt: now,
        version: sql`${channelStreams.version} + 1`,
      })
      .where(
        and(
          eq(channelStreams.sourceChannelId, sourceChannelId),
          or(
            eq(channelStreams.origin, "source"),
            isNull(channelStreams.origin),
          ),
          isNull(channelStreams.missingSince),
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
    const members = await this.executor
      .select({
        canonicalChannelId: canonicalChannelMembers.canonicalChannelId,
        sourceChannelId: canonicalChannelMembers.sourceChannelId,
      })
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.active, true));
    if (members.length === 0) return null;

    const sourceChannelIds = new Set(members.map((m) => m.sourceChannelId));
    const sourceChannels = await this.executor
      .select({ id: channels.id, tvgId: channels.tvgId })
      .from(channels)
      .where(
        or(
          eq(channels.sourcePresence, "present"),
          isNull(channels.sourcePresence),
        ),
      );
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

  async insertWeakMatchCandidate(
    input: WeakMatchCandidateInput,
  ): Promise<void> {
    // The merge_candidates table stores reasons as Postgres array literal.
    const reasonsLiteral = `{${input.reasons.map((r) => r.replace(/,/g, " ")).join(",")}}`;
    await this.executor
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
    const [row] = await this.executor
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
    const canonicalRows = await this.executor
      .select({
        id: canonicalChannels.id,
        standardName: canonicalChannels.standardName,
        standardGroup: canonicalChannels.standardGroup,
      })
      .from(canonicalChannels);
    const memberRows = await this.executor
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
