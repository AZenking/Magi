import { eq } from "drizzle-orm";
import { db } from "../db";
import { channels, rawXmltvChannels } from "../schema";
import { EpgMatcher } from "@magi/backend-core";
import type { SyncProgress } from "@magi/backend-core";
import { reconcileCanonicals } from "./reconcile-canonicals";

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
  const allXmltvIdentities = await db
    .select({
      sourceId: rawXmltvChannels.sourceId,
      xmltvId: rawXmltvChannels.xmltvId,
    })
    .from(rawXmltvChannels);
  const sourcesByXmltvId = new Map<string, Set<string>>();
  for (const row of allXmltvIdentities) {
    const sourceIds = sourcesByXmltvId.get(row.xmltvId) ?? new Set<string>();
    sourceIds.add(row.sourceId);
    sourcesByXmltvId.set(row.xmltvId, sourceIds);
  }

  const allChannels = await db.select().from(channels).limit(100000);

  await progress?.updateProgress(30, "match");

  const matcher = new EpgMatcher();
  let matched = 0;
  let unmatched = 0;
  let conflicts = 0;

  const channelUpdates: { channelId: string; epgChannelId: string; epgMatchType: string | null }[] = [];
  const channelConflicts = new Map<string, string>();

  for (const channel of allChannels) {
    const result = matcher.match({
      channelTvgId: channel.tvgId,
      channelTvgName: null,
      channelDisplayName: channel.displayName,
      manualEpgChannelId: null,
      xmltvChannels: xmltvList,
    });

    if (result.matched && result.xmltvChannelId) {
      if ((sourcesByXmltvId.get(result.xmltvChannelId)?.size ?? 0) > 1) {
        channelConflicts.set(channel.id, result.xmltvChannelId);
        conflicts++;
      } else {
        channelUpdates.push({ channelId: channel.id, epgChannelId: result.xmltvChannelId, epgMatchType: result.matchType });
        matched++;
      }
    } else if (result.matchType === "conflict") {
      conflicts++;
    } else {
      unmatched++;
    }
  }

  await progress?.updateProgress(50, "rebuild-canonical");

  // Write EPG match results back to channels, then delegate canonical
  // rebuild to the shared reconcileCanonicals function (008 T015/T018).
  await db.transaction(async (tx) => {
    for (const u of channelUpdates) {
      await tx.update(channels).set({
        epgChannelId: u.epgChannelId,
        epgMatchType: u.epgMatchType,
      }).where(eq(channels.id, u.channelId));
    }
  });

  const epgUpdateMap = new Map(channelUpdates.map((u) => [u.channelId, u]));
  await reconcileCanonicals(epgUpdateMap, channelConflicts, sourceId);

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
