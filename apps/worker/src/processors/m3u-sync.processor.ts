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

export async function processM3uSync(sourceId: string, progress?: SyncProgress): Promise<SyncResult> {
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
