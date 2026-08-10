import {
  eq,
  lt,
  and,
  inArray,
  notInArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import {
  syncLogs,
  channels,
  m3uSources,
  channelStreams,
  canonicalChannels,
  canonicalChannelMembers,
} from "../schema";

interface CleanupResult {
  deletedTasks: number;
  deletedOrphanChannels: number;
  purgedMissingChannels: number;
  purgedMissingStreams: number;
  reapedCanonicalChannels: number;
}

export async function processCleanup(progress?: {
  updateProgress(pct: number, step: string): Promise<void>;
}): Promise<CleanupResult> {
  const repairPrimaryStreams = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    canonicalIds: readonly string[],
  ): Promise<void> => {
    if (canonicalIds.length === 0) return;
    const canonicals = await tx
      .select({
        id: canonicalChannels.id,
        primaryStreamId: canonicalChannels.primaryStreamId,
      })
      .from(canonicalChannels)
      .where(inArray(canonicalChannels.id, [...canonicalIds]));
    for (const canonical of canonicals) {
      const streams = await tx
        .select({
          id: channelStreams.id,
          isPrimary: channelStreams.isPrimary,
          position: channelStreams.position,
          createdAt: channelStreams.createdAt,
          origin: channelStreams.origin,
          missingSince: channelStreams.missingSince,
          purgedAt: channelStreams.purgedAt,
        })
        .from(channelStreams)
        .where(eq(channelStreams.canonicalChannelId, canonical.id));
      streams.sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
            (b.position ?? Number.MAX_SAFE_INTEGER) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const eligible = streams.filter(
        (stream) =>
          stream.origin === "manual" ||
          (stream.missingSince == null && stream.purgedAt == null),
      );
      const primary =
        eligible.find((stream) => stream.isPrimary) ?? eligible[0] ?? null;
      for (const stream of streams) {
        const shouldBePrimary = stream.id === primary?.id;
        if (stream.isPrimary !== shouldBePrimary) {
          await tx
            .update(channelStreams)
            .set({
              isPrimary: shouldBePrimary,
              version: sql`${channelStreams.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(channelStreams.id, stream.id));
        }
      }
      if (canonical.primaryStreamId !== (primary?.id ?? null)) {
        await tx
          .update(canonicalChannels)
          .set({
            primaryStreamId: primary?.id ?? null,
            version: sql`${canonicalChannels.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(canonicalChannels.id, canonical.id));
      }
    }
  };

  await progress?.updateProgress(10, "tasks");

  // Delete completed/failed/cancelled tasks older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deletedTasks = await db
    .delete(syncLogs)
    .where(
      and(
        inArray(syncLogs.status, ["success", "failed", "cancelled"]),
        lt(syncLogs.finishedAt, thirtyDaysAgo),
      ),
    )
    .returning();

  await progress?.updateProgress(30, "orphans");

  // Find orphan channels (m3uSourceId points to a deleted source)
  const activeSourceIds = (
    await db.select({ id: m3uSources.id }).from(m3uSources)
  ).map((r) => r.id);

  let deletedOrphanChannels = 0;
  const orphanWhere =
    activeSourceIds.length > 0
      ? and(
          isNotNull(channels.m3uSourceId),
          notInArray(channels.m3uSourceId, activeSourceIds),
        )
      : isNotNull(channels.m3uSourceId);
  const orphanRows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(orphanWhere);
  if (orphanRows.length > 0) {
    const orphanIds = orphanRows.map((row) => row.id);
    await db.transaction(async (tx) => {
      const affectedCanonicalRows = await tx
        .select({ canonicalChannelId: channelStreams.canonicalChannelId })
        .from(channelStreams)
        .where(
          and(
            inArray(channelStreams.sourceChannelId, orphanIds),
            or(
              eq(channelStreams.origin, "source"),
              isNull(channelStreams.origin),
            ),
          ),
        );
      await tx
        .delete(channelStreams)
        .where(
          and(
            inArray(channelStreams.sourceChannelId, orphanIds),
            or(
              eq(channelStreams.origin, "source"),
              isNull(channelStreams.origin),
            ),
          ),
        );
      // canonical_channel_members deliberately has no FK so canonical rows can
      // outlive a source. Remove only memberships for truly deleted source
      // channels before deleting those channels; otherwise every cleanup run
      // leaves dangling membership records.
      await tx
        .delete(canonicalChannelMembers)
        .where(inArray(canonicalChannelMembers.sourceChannelId, orphanIds));
      const deleted = await tx
        .delete(channels)
        .where(inArray(channels.id, orphanIds))
        .returning({ id: channels.id });
      deletedOrphanChannels = deleted.length;
      await repairPrimaryStreams(tx, [
        ...new Set(affectedCanonicalRows.map((row) => row.canonicalChannelId)),
      ]);
    });
  }

  await progress?.updateProgress(50, "purge-missing");

  // FR-017: purge source channels that have been missing for 30 days.
  // Transition them to 'purged' state and clear their stream missingSince.
  let purgedMissingChannels = 0;
  let purgedMissingStreams = 0;
  let reapedCanonicalChannels = 0;
  await db.transaction(async (tx) => {
    const purgedChannels = await tx
      .update(channels)
      .set({
        sourcePresence: "purged",
        version: sql`${channels.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(channels.sourcePresence, "missing"),
          lt(channels.missingSince, thirtyDaysAgo),
        ),
      )
      .returning({ id: channels.id });
    purgedMissingChannels = purgedChannels.length;

    if (purgedChannels.length > 0) {
      const purgedChannelIds = purgedChannels.map((c) => c.id);
      const affectedCanonicalRows = await tx
        .select({ canonicalChannelId: channelStreams.canonicalChannelId })
        .from(channelStreams)
        .where(
          and(
            inArray(channelStreams.sourceChannelId, purgedChannelIds),
            or(
              eq(channelStreams.origin, "source"),
              isNull(channelStreams.origin),
            ),
          ),
        );
      const streamsResult = await tx
        .update(channelStreams)
        .set({
          missingSince: null,
          purgedAt: new Date(),
          version: sql`${channelStreams.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(channelStreams.sourceChannelId, purgedChannelIds),
            isNotNull(channelStreams.sourceChannelId),
            or(
              eq(channelStreams.origin, "source"),
              isNull(channelStreams.origin),
            ),
            isNull(channelStreams.purgedAt),
          ),
        )
        .returning({ id: channelStreams.id });
      purgedMissingStreams = streamsResult.length;

      // Retention expiry removes automatic source membership; canonical rows
      // remain if they still carry a manual stream or operator lifecycle.
      await tx
        .update(canonicalChannelMembers)
        .set({
          active: false,
          leftAt: new Date(),
          version: sql`${canonicalChannelMembers.version} + 1`,
        })
        .where(
          and(
            inArray(canonicalChannelMembers.sourceChannelId, purgedChannelIds),
            eq(canonicalChannelMembers.membershipSource, "automatic"),
            eq(canonicalChannelMembers.active, true),
          ),
        );
      await repairPrimaryStreams(tx, [
        ...new Set(affectedCanonicalRows.map((row) => row.canonicalChannelId)),
      ]);
    }

    // Reap only truly empty automatic canonicals. A canonical with an
    // operator lifecycle (hidden/disabled/trashed), any stream (especially a
    // manual stream), or an active member is durable by design. Delete the
    // inactive membership rows in the same transaction to avoid orphans.
    const reaped = await tx
      .select({ id: canonicalChannels.id })
      .from(canonicalChannels)
      .where(
        and(
          eq(canonicalChannels.lifecycle, "active"),
          notInArray(
            canonicalChannels.id,
            tx
              .select({ id: canonicalChannelMembers.canonicalChannelId })
              .from(canonicalChannelMembers)
              .where(eq(canonicalChannelMembers.active, true)),
          ),
          notInArray(
            canonicalChannels.id,
            tx
              .select({ id: channelStreams.canonicalChannelId })
              .from(channelStreams),
          ),
        ),
      );
    if (reaped.length > 0) {
      const ids = reaped.map((row) => row.id);
      await tx
        .delete(canonicalChannelMembers)
        .where(inArray(canonicalChannelMembers.canonicalChannelId, ids));
      const deleted = await tx
        .delete(canonicalChannels)
        .where(inArray(canonicalChannels.id, ids))
        .returning({ id: canonicalChannels.id });
      reapedCanonicalChannels = deleted.length;
    }
  });

  await progress?.updateProgress(75, "reap-canonicals");

  await progress?.updateProgress(100, "done");

  return {
    deletedTasks: deletedTasks.length,
    deletedOrphanChannels,
    purgedMissingChannels,
    purgedMissingStreams,
    reapedCanonicalChannels,
  };
}
