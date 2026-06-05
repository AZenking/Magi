import { eq } from "drizzle-orm";
import { db } from "../db";
import { channels, rawXmltvChannels, canonicalChannels, channelOverrides, channelStreams } from "../schema";
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

  await progress?.updateProgress(50, "rebuild-canonical");

  await db.transaction(async (tx) => {
    // Update EPG match results on raw channels
    for (const u of channelUpdates) {
      await tx.update(channels).set({
        epgChannelId: u.epgChannelId,
        epgMatchType: u.epgMatchType,
      }).where(eq(channels.id, u.channelId));
    }

    // Load overrides indexed by channelId
    const overrideRows = await tx.select().from(channelOverrides);
    const overrideMap = new Map(overrideRows.map((o) => [o.channelId, o]));

    // Load existing canonical channels indexed by mergedFromIds
    const existingCanonical = await tx.select().from(canonicalChannels);
    const canonicalByMergedId = new Map(existingCanonical.map((c) => [c.mergedFromIds, c]));
    const existingCanonicalIds = new Set(existingCanonical.map((c) => c.id));

    // Load existing streams indexed by canonicalChannelId
    const existingStreams = await tx.select().from(channelStreams);
    const streamsByCanonicalId = new Map<string, typeof existingStreams>();
    for (const s of existingStreams) {
      const arr = streamsByCanonicalId.get(s.canonicalChannelId) ?? [];
      arr.push(s);
      streamsByCanonicalId.set(s.canonicalChannelId, arr);
    }

    const allChannelsAfter = await tx.select().from(channels).limit(10000);

    const activeRawIds = new Set(allChannelsAfter.map((ch) => ch.id));

    // Mark canonicals whose raw channel no longer exists as disabled
    for (const canon of existingCanonical) {
      if (canon.mergedFromIds && !activeRawIds.has(canon.mergedFromIds) && !canon.disabled) {
        await tx.update(canonicalChannels).set({ disabled: true, outputStatus: "inactive" }).where(eq(canonicalChannels.id, canon.id));
      }
    }

    // Upsert canonical channels and create default streams
    for (const ch of allChannelsAfter) {
      const ov = overrideMap.get(ch.id);

      const standardName = ov?.customName ?? ch.displayName;
      const standardGroup = ov?.customGroup ?? ch.groupTitle;
      const standardLogo = ov?.customLogo ?? ch.tvgLogo;
      const channelNumber = ov?.channelNumber ?? null;
      const hidden = ov?.hidden ?? false;
      const starred = ov?.starred ?? false;

      let epgChannelId = ch.epgChannelId;
      let epgMatchType = ch.epgMatchType;
      let epgStatus: string | null = ch.epgChannelId ? "matched_auto" : null;

      if (ov?.manualEpgChannelId !== undefined && ov.manualEpgChannelId !== null) {
        epgChannelId = ov.manualEpgChannelId;
        epgMatchType = "manual";
        epgStatus = "matched_manual";
      }

      const existing = canonicalByMergedId.get(ch.id);

      if (existing) {
        // Update existing canonical — preserve ID
        await tx.update(canonicalChannels).set({
          standardName,
          standardGroup,
          standardLogo,
          channelNumber,
          hidden,
          starred,
          disabled: false,
          epgChannelId,
          epgMatchType,
          epgStatus,
          outputStatus: "active",
          lastMergedAt: new Date(),
        }).where(eq(canonicalChannels.id, existing.id));

        // Backfill default stream if canonical has none and raw channel has streamUrl
        const existingStreamsForCanonical = streamsByCanonicalId.get(existing.id) ?? [];
        if (existingStreamsForCanonical.length === 0 && ch.streamUrl) {
          const [stream] = await tx.insert(channelStreams).values({
            canonicalChannelId: existing.id,
            m3uSourceId: ch.m3uSourceId,
            rawChannelId: ch.rawChannelId,
            sourceChannelId: ch.id,
            streamUrl: ch.streamUrl,
            isPrimary: true,
            healthStatus: "unknown",
            responseTime: null,
            lastCheckedAt: null,
            lastSuccessAt: null,
            consecutiveFailures: 0,
            successRate: null,
            streamError: null,
          }).returning();

          if (stream) {
            await tx.update(canonicalChannels).set({
              primaryStreamId: stream.id,
            }).where(eq(canonicalChannels.id, existing.id));
          }
        }
      } else {
        // Insert new canonical
        const [inserted] = await tx.insert(canonicalChannels).values({
          standardName,
          standardGroup,
          standardLogo,
          channelNumber,
          hidden,
          starred,
          disabled: false,
          epgChannelId,
          epgMatchType,
          epgStatus,
          outputStatus: "active",
          qualityScore: null,
          primaryStreamId: null,
          mergedFromIds: ch.id,
          mergeMethod: null,
          conflictNote: null,
          lastMergedAt: new Date(),
        }).returning();

        // Auto-create default stream from raw channel if streamUrl exists
        if (inserted && ch.streamUrl) {
          const [stream] = await tx.insert(channelStreams).values({
            canonicalChannelId: inserted.id,
            m3uSourceId: ch.m3uSourceId,
            rawChannelId: ch.rawChannelId,
            sourceChannelId: ch.id,
            streamUrl: ch.streamUrl,
            isPrimary: true,
            healthStatus: "unknown",
            responseTime: null,
            lastCheckedAt: null,
            lastSuccessAt: null,
            consecutiveFailures: 0,
            successRate: null,
            streamError: null,
          }).returning();

          if (stream) {
            await tx.update(canonicalChannels).set({
              primaryStreamId: stream.id,
            }).where(eq(canonicalChannels.id, inserted.id));
          }
        }
      }
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
