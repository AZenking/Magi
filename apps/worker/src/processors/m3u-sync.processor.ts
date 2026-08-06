import { eq } from "drizzle-orm";
import { db } from "../db";
import { m3uSources, rawM3uChannels, channels } from "../schema";
import { downloadSource, parseM3U, generateChannelIdentity } from "@magi/backend-core";
import type { SyncProgress } from "@magi/backend-core";

interface SyncResult {
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
}

/**
 * Batch result when a scheduled sync fans out across all enabled sources
 * (008-pipeline-reliability T013).
 */
interface SyncBatchResult {
  totalSources: number;
  succeededSources: number;
  failedSources: number;
  results: Array<{ sourceId: string; status: "success" | "failed"; error?: string }>;
}

/**
 * Process an M3U source sync. When `sourceId` is null (scheduled/timer
 * invocation), fans out across all enabled M3U sources — each source is
 * synced independently so a single source failure does not block others.
 */
export async function processM3uSync(
  sourceId: string | null,
  progress?: SyncProgress,
): Promise<SyncResult | SyncBatchResult> {
  // Fan-out: scheduled jobs arrive with sourceId=null. Iterate all enabled
  // sources and sync each one independently.
  if (!sourceId) {
    const enabledSources = await db
      .select({ id: m3uSources.id })
      .from(m3uSources)
      .where(eq(m3uSources.enabled, true));

    const results: SyncBatchResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < enabledSources.length; i++) {
      const sid = enabledSources[i]!.id;
      try {
        await processM3uSync(sid, undefined);
        succeeded++;
        results.push({ sourceId: sid, status: "success" });
      } catch (error) {
        failed++;
        results.push({
          sourceId: sid,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      // Coarse progress across the batch.
      await progress?.updateProgress(
        Math.round(((i + 1) / enabledSources.length) * 100),
        "batch-sync",
      );
    }

    return { totalSources: enabledSources.length, succeededSources: succeeded, failedSources: failed, results };
  }

  // Single-source sync (manual trigger or fan-out child).
  const [source] = await db.select().from(m3uSources).where(eq(m3uSources.id, sourceId)).limit(1);
  if (!source || !source.enabled) {
    throw new Error("Source not found or disabled");
  }

  await progress?.updateProgress(10, "download");

  const { content, statusCode } = await downloadSource(source.url, {
    headers: source.headers ?? undefined,
  });

  if (statusCode !== 200 || !content) {
    await db.update(m3uSources).set({
      lastSyncAt: new Date(),
      lastSyncStatus: "failed",
      updatedAt: new Date(),
    }).where(eq(m3uSources.id, sourceId));
    throw new Error(`Download failed: HTTP ${statusCode}`);
  }

  await progress?.updateProgress(40, "parse");

  const entries = parseM3U(content);
  const now = new Date();

  const rawChannelData = entries.map((entry) => ({
    sourceId,
    tvgId: entry.tvgId,
    tvgName: entry.tvgName,
    tvgLogo: entry.tvgLogo,
    groupTitle: entry.groupTitle,
    displayName: entry.displayName,
    streamUrl: entry.streamUrl,
    channelIdentity: generateChannelIdentity(sourceId, entry),
    syncedAt: now,
    disappeared: false,
  }));

  await progress?.updateProgress(60, "write");

  await db.transaction(async (tx) => {
    await tx.delete(rawM3uChannels).where(eq(rawM3uChannels.sourceId, sourceId));

    const rawResults = rawChannelData.length > 0
      ? await tx.insert(rawM3uChannels).values(rawChannelData).onConflictDoNothing().returning()
      : [];

    await tx.delete(channels).where(eq(channels.m3uSourceId, sourceId));

    if (rawResults.length > 0) {
      const channelData = rawResults.map((rc) => ({
        channelIdentity: rc.channelIdentity,
        m3uSourceId: sourceId,
        rawChannelId: rc.id,
        displayName: rc.displayName,
        groupTitle: rc.groupTitle,
        tvgId: rc.tvgId,
        tvgLogo: rc.tvgLogo,
        streamUrl: rc.streamUrl,
        epgChannelId: null as string | null,
        epgMatchType: null as string | null,
        streamStatus: null as string | null,
        streamResponseTime: null as number | null,
        streamCheckedAt: null as Date | null,
        streamError: null as string | null,
        active: true,
      }));
      await tx.insert(channels).values(channelData);
    }
  });

  await progress?.updateProgress(80, "reconcile-canonical");

  // 008-pipeline-reliability T017: rebuild canonical channels immediately
  // after M3U sync so output is visible without a manual EPG match trigger.
  const { reconcileCanonicals } = await import("./reconcile-canonicals");
  await reconcileCanonicals();

  await progress?.updateProgress(90, "finalize");

  await db.update(m3uSources).set({
    lastSyncAt: now,
    lastSyncStatus: "success",
    updatedAt: new Date(),
  }).where(eq(m3uSources.id, sourceId));

  return {
    importedCount: entries.length,
    addedCount: entries.length,
    updatedCount: 0,
    removedCount: 0,
  };
}
