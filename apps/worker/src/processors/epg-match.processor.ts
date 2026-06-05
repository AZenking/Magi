import { eq } from "drizzle-orm";
import { db } from "../db";
import { channels, rawXmltvChannels, canonicalChannels } from "../schema";
import { EpgMatcher } from "@magi/backend-core";
import type { SyncProgress } from "@magi/backend-core";

interface EpgMatchResult {
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  matched: number;
  unmatched: number;
  conflicts: number;
}

export async function processEpgMatch(sourceId: string, progress?: SyncProgress): Promise<EpgMatchResult> {
  await progress?.updateProgress(10, "fetch");

  const xmltvChannelRows = await db.select().from(rawXmltvChannels).where(eq(rawXmltvChannels.sourceId, sourceId));
  const xmltvList = xmltvChannelRows.map((c) => ({ id: c.xmltvId, displayName: c.displayName ?? "" }));

  const allChannels = await db.select().from(channels).limit(50000);

  await progress?.updateProgress(30, "match");

  const matcher = new EpgMatcher();
  let matched = 0;
  let unmatched = 0;
  let conflicts = 0;

  const channelUpdates: { channelId: string; epgChannelId: string; epgMatchType: string | null }[] = [];

  for (const channel of allChannels) {
    const result = matcher.match({
      channelTvgId: channel.tvgId,
      channelTvgName: null,
      channelDisplayName: channel.displayName,
      manualEpgChannelId: null,
      xmltvChannels: xmltvList,
    });

    if (result.matched && result.xmltvChannelId) {
      channelUpdates.push({ channelId: channel.id, epgChannelId: result.xmltvChannelId, epgMatchType: result.matchType });
      matched++;
    } else if (result.matchType === "conflict") {
      conflicts++;
    } else {
      unmatched++;
    }
  }

  await progress?.updateProgress(80, "rebuild-canonical");

  await db.transaction(async (tx) => {
    for (const u of channelUpdates) {
      await tx.update(channels).set({
        epgChannelId: u.epgChannelId,
        epgMatchType: u.epgMatchType,
      }).where(eq(channels.id, u.channelId));
    }

    await tx.delete(canonicalChannels);

    const allChannelsAfter = await tx.select().from(channels).limit(10000);
    if (allChannelsAfter.length > 0) {
      const canonicalData = allChannelsAfter.map((ch) => ({
        standardName: ch.displayName,
        standardGroup: ch.groupTitle,
        standardLogo: ch.tvgLogo,
        channelNumber: null,
        hidden: false,
        starred: false,
        disabled: false,
        epgChannelId: ch.epgChannelId,
        epgMatchType: ch.epgMatchType,
        epgStatus: ch.epgChannelId ? "matched_auto" : null,
        outputStatus: "active",
        qualityScore: null,
        primaryStreamId: null,
        mergedFromIds: ch.id,
        mergeMethod: null,
        conflictNote: null,
        lastMergedAt: new Date(),
      }));
      await tx.insert(canonicalChannels).values(canonicalData);
    }
  });

  return {
    importedCount: matched,
    addedCount: matched,
    updatedCount: 0,
    removedCount: 0,
    matched,
    unmatched,
    conflicts,
  };
}
