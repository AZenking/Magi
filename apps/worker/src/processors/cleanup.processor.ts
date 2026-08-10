import { eq, lt, and, inArray, notInArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { syncLogs, channels, m3uSources, channelStreams, canonicalChannels, canonicalChannelMembers } from "../schema";

interface CleanupResult {
  deletedTasks: number;
  deletedOrphanChannels: number;
  purgedMissingChannels: number;
  purgedMissingStreams: number;
  reapedCanonicalChannels: number;
}

export async function processCleanup(progress?: { updateProgress(pct: number, step: string): Promise<void> }): Promise<CleanupResult> {
  await progress?.updateProgress(10, "tasks");

  // Delete completed/failed/cancelled tasks older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deletedTasks = await db.delete(syncLogs).where(
    and(
      inArray(syncLogs.status, ["success", "failed", "cancelled"]),
      lt(syncLogs.finishedAt, thirtyDaysAgo),
    ),
  ).returning();

  await progress?.updateProgress(30, "orphans");

  // Find orphan channels (m3uSourceId points to a deleted source)
  const activeSourceIds = (await db.select({ id: m3uSources.id }).from(m3uSources)).map((r) => r.id);

  let deletedOrphanChannels = 0;
  if (activeSourceIds.length > 0) {
    const orphans = await db.delete(channels).where(
      and(
        isNotNull(channels.m3uSourceId),
        notInArray(channels.m3uSourceId, activeSourceIds),
      ),
    ).returning();
    deletedOrphanChannels = orphans.length;
  }

  await progress?.updateProgress(50, "purge-missing");

  // FR-017: purge source channels that have been missing for 30 days.
  // Transition them to 'purged' state and clear their stream missingSince.
  const purgedChannels = await db
    .update(channels)
    .set({ sourcePresence: "purged" })
    .where(
      and(
        eq(channels.sourcePresence, "missing"),
        lt(channels.missingSince, thirtyDaysAgo),
      ),
    )
    .returning({ id: channels.id });

  let purgedMissingStreams = 0;
  if (purgedChannels.length > 0) {
    const purgedChannelIds = purgedChannels.map((c) => c.id);
    const streamsResult = await db
      .update(channelStreams)
      .set({ missingSince: null })
      .where(
        and(
          inArray(channelStreams.rawChannelId, purgedChannelIds),
          isNotNull(channelStreams.rawChannelId),
        ),
      )
      .returning({ id: channelStreams.id });
    purgedMissingStreams = streamsResult.length;
  }

  await progress?.updateProgress(75, "reap-canonicals");

  // Reap canonical channels that have zero active members. These accumulate
  // when all their source channels go missing/purged. Safe to delete because
  // canonical_channel_members has no FK back to canonical_channels and the
  // output layer only shows canonicals with active members.
  const reapedCanonicals = await db
    .delete(canonicalChannels)
    .where(
      notInArray(
        canonicalChannels.id,
        db
          .select({ id: canonicalChannelMembers.canonicalChannelId })
          .from(canonicalChannelMembers)
          .where(eq(canonicalChannelMembers.active, true)),
      ),
    )
    .returning({ id: canonicalChannels.id });

  await progress?.updateProgress(100, "done");

  return {
    deletedTasks: deletedTasks.length,
    deletedOrphanChannels,
    purgedMissingChannels: purgedChannels.length,
    purgedMissingStreams,
    reapedCanonicalChannels: reapedCanonicals.length,
  };
}
