import { lt, and, inArray, notInArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { syncLogs, channels, m3uSources } from "../schema";

interface CleanupResult {
  deletedTasks: number;
  deletedOrphanChannels: number;
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

  await progress?.updateProgress(50, "orphans");

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

  await progress?.updateProgress(100, "done");

  return {
    deletedTasks: deletedTasks.length,
    deletedOrphanChannels,
  };
}
