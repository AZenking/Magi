import { eq } from "drizzle-orm";
import { db } from "../db";
import { channels, rawXmltvChannels, canonicalChannels, channelOverrides, channelStreams, m3uSources } from "../schema";
import { EpgMatcher, computeMergeKey } from "@magi/backend-core";
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

    // Build identity → channel row map (stable key for this run)
    const channelByIdentity = new Map<string, typeof allChannels[0]>();
    for (const ch of allChannels) {
      channelByIdentity.set(ch.channelIdentity, ch);
    }

    // Load overrides indexed by channel identity (not volatile UUID)
    const overrideRows = await tx.select().from(channelOverrides);
    // overrideRows.channelId references channels.id, but after sync those IDs are new.
    // Build overrideMap keyed by channelIdentity: find override's channel row by its current ID,
    // then index by identity.
    const overrideByIdentity = new Map<string, typeof overrideRows[0]>();
    for (const ov of overrideRows) {
      // Find the channel row for this override — try current channels first
      const ch = allChannels.find((c) => c.id === ov.channelId);
      if (ch) {
        overrideByIdentity.set(ch.channelIdentity, ov);
      } else {
        // Override's channelId may be stale (from a previous sync).
        // Keep it keyed by the old UUID for fallback lookup.
        overrideByIdentity.set(ov.channelId, ov);
      }
    }

    // Load existing canonical channels
    const existingCanonical = await tx.select().from(canonicalChannels);

    // Load existing streams indexed by canonicalChannelId
    const existingStreams = await tx.select().from(channelStreams);
    const streamsByCanonicalId = new Map<string, typeof existingStreams>();
    for (const s of existingStreams) {
      const arr = streamsByCanonicalId.get(s.canonicalChannelId) ?? [];
      arr.push(s);
      streamsByCanonicalId.set(s.canonicalChannelId, arr);
    }

    // Load M3U source priorities
    const sourceRows = await tx.select({ id: m3uSources.id, priority: m3uSources.priority }).from(m3uSources);
    const sourcePriority = new Map(sourceRows.map((s) => [s.id, s.priority ?? 0]));

    const allChannelsAfter = await tx.select().from(channels).limit(50000);
    const activeIdentities = new Set(allChannelsAfter.map((ch) => ch.channelIdentity));

    // Step 1: Group channels by merge key
    const channelsByMergeKey = new Map<string, typeof allChannelsAfter>();
    for (const ch of allChannelsAfter) {
      const key = computeMergeKey({ tvgId: ch.tvgId, displayName: ch.displayName, groupTitle: ch.groupTitle });
      const arr = channelsByMergeKey.get(key) ?? [];
      arr.push(ch);
      channelsByMergeKey.set(key, arr);
    }

    // Step 2: Build a mapping from mergeKey → existing canonicals
    // Resolve mergedFromIds (now channelIdentity strings) to current channel rows to compute merge key
    const canonicalsByMergeKey = new Map<string, typeof existingCanonical>();
    for (const canon of existingCanonical) {
      if (!canon.mergedFromIds || canon.disabled) continue;
      let identities: string[];
      try {
        const parsed = JSON.parse(canon.mergedFromIds);
        identities = Array.isArray(parsed) ? parsed : [canon.mergedFromIds];
      } catch {
        identities = [canon.mergedFromIds];
      }

      // Try to find a still-active channel to compute merge key
      let resolvedChannel: typeof allChannelsAfter[0] | undefined;
      for (const id of identities) {
        // Try as channelIdentity first (new format)
        const ch = allChannelsAfter.find((c) => c.channelIdentity === id);
        if (ch) { resolvedChannel = ch; break; }
        // Fallback: try as old UUID (legacy format)
        const chById = allChannelsAfter.find((c) => c.id === id);
        if (chById) { resolvedChannel = chById; break; }
      }

      if (resolvedChannel) {
        const key = computeMergeKey({ tvgId: resolvedChannel.tvgId, displayName: resolvedChannel.displayName, groupTitle: resolvedChannel.groupTitle });
        const arr = canonicalsByMergeKey.get(key) ?? [];
        arr.push(canon);
        canonicalsByMergeKey.set(key, arr);
      }
    }

    // Step 3: Mark canonicals whose all source identities no longer exist as disabled
    for (const canon of existingCanonical) {
      if (canon.disabled) continue;
      if (!canon.mergedFromIds) continue;
      let identities: string[];
      try {
        const parsed = JSON.parse(canon.mergedFromIds);
        identities = Array.isArray(parsed) ? parsed : [canon.mergedFromIds];
      } catch {
        identities = [canon.mergedFromIds];
      }
      const anyActive = identities.some((id) => activeIdentities.has(id));
      if (!anyActive) {
        await tx.update(canonicalChannels).set({ disabled: true, outputStatus: "inactive" }).where(eq(canonicalChannels.id, canon.id));
      }
    }

    // Step 4: Upsert canonical channels per merge group and create streams
    for (const [mergeKey, group] of channelsByMergeKey) {
      // Sort group by source priority (higher priority first)
      group.sort((a, b) => {
        const pa = a.m3uSourceId ? (sourcePriority.get(a.m3uSourceId) ?? 0) : 0;
        const pb = b.m3uSourceId ? (sourcePriority.get(b.m3uSourceId) ?? 0) : 0;
        return pb - pa;
      });
      const best = group[0]!;

      // Look for override on ANY channel in the group by identity
      const ov = overrideByIdentity.get(best.channelIdentity) ?? group
        .slice(1)
        .map((ch) => overrideByIdentity.get(ch.channelIdentity))
        .find((o) => o !== undefined);

      const standardName = ov?.customName ?? best.displayName;
      const standardGroup = ov?.customGroup ?? best.groupTitle;
      const standardLogo = ov?.customLogo ?? best.tvgLogo;
      const channelNumber = ov?.channelNumber ?? null;
      const hidden = ov?.hidden ?? false;
      const starred = ov?.starred ?? false;

      // Collect best EPG info from the group
      let epgChannelId: string | null = null;
      let epgMatchType: string | null = null;
      let epgStatus: string | null = null;

      // Check manual override from any channel in the group first
      if (ov?.manualEpgChannelId !== undefined && ov.manualEpgChannelId !== null) {
        epgChannelId = ov.manualEpgChannelId;
        epgMatchType = "manual";
        epgStatus = "matched_manual";
      } else {
        for (const ch of group) {
          const chOv = overrideByIdentity.get(ch.channelIdentity);
          if (chOv?.manualEpgChannelId) {
            epgChannelId = chOv.manualEpgChannelId;
            epgMatchType = "manual";
            epgStatus = "matched_manual";
            break;
          }
          if (ch.epgChannelId && !epgChannelId) {
            epgChannelId = ch.epgChannelId;
            epgMatchType = ch.epgMatchType;
            epgStatus = "matched_auto";
          }
        }
      }

      // Store channelIdentity strings in mergedFromIds (stable across syncs)
      const mergedIdentities = JSON.stringify(group.map((g) => g.channelIdentity));
      const existingGroup = canonicalsByMergeKey.get(mergeKey);

      if (existingGroup && existingGroup.length > 0) {
        // Pick survivor: prefer the one with the most streams
        const survivor = existingGroup.reduce((a, b) => {
          const aStreams = streamsByCanonicalId.get(a.id)?.length ?? 0;
          const bStreams = streamsByCanonicalId.get(b.id)?.length ?? 0;
          return aStreams >= bStreams ? a : b;
        });

        // Disable and migrate duplicates
        for (const canon of existingGroup) {
          if (canon.id === survivor.id) continue;
          const dupStreams = streamsByCanonicalId.get(canon.id) ?? [];
          for (const s of dupStreams) {
            await tx.update(channelStreams)
              .set({ canonicalChannelId: survivor.id, isPrimary: false })
              .where(eq(channelStreams.id, s.id));
          }
          await tx.update(canonicalChannels)
            .set({ disabled: true, outputStatus: "inactive" })
            .where(eq(canonicalChannels.id, canon.id));
        }

        // Normalize primary: keep only one primary stream on the survivor
        const survivorOwnStreams = streamsByCanonicalId.get(survivor.id) ?? [];
        const survivorPrimary = survivorOwnStreams.find((s) => s.isPrimary);
        const newPrimaryId = survivorPrimary?.id ?? null;
        for (const s of survivorOwnStreams) {
          if (s.isPrimary && s.id !== newPrimaryId) {
            await tx.update(channelStreams)
              .set({ isPrimary: false })
              .where(eq(channelStreams.id, s.id));
          }
        }
        if (survivor.primaryStreamId !== newPrimaryId) {
          await tx.update(canonicalChannels)
            .set({ primaryStreamId: newPrimaryId })
            .where(eq(canonicalChannels.id, survivor.id));
        }

        // Update survivor canonical
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
          mergedFromIds: mergedIdentities,
          mergeMethod: group.length > 1 ? "merge_key" : null,
          lastMergedAt: new Date(),
        }).where(eq(canonicalChannels.id, survivor.id));

        // Create streams — dedupe by streamUrl (sourceChannelId may be stale)
        const allSurvivorStreams = await tx.select().from(channelStreams)
          .where(eq(channelStreams.canonicalChannelId, survivor.id));
        const existingUrls = new Set(allSurvivorStreams.map((s) => s.streamUrl));
        let hasPrimary = allSurvivorStreams.some((s) => s.isPrimary);

        for (const ch of group) {
          if (!ch.streamUrl) continue;
          if (existingUrls.has(ch.streamUrl)) continue;

          const isPrimary = !hasPrimary;
          const [stream] = await tx.insert(channelStreams).values({
            canonicalChannelId: survivor.id,
            m3uSourceId: ch.m3uSourceId,
            rawChannelId: ch.rawChannelId,
            sourceChannelId: ch.id,
            streamUrl: ch.streamUrl,
            isPrimary,
            healthStatus: "unknown",
            responseTime: null,
            lastCheckedAt: null,
            lastSuccessAt: null,
            consecutiveFailures: 0,
            successRate: null,
            streamError: null,
          }).returning();

          if (stream && isPrimary) {
            hasPrimary = true;
            await tx.update(canonicalChannels).set({ primaryStreamId: stream.id }).where(eq(canonicalChannels.id, survivor.id));
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
          mergedFromIds: mergedIdentities,
          mergeMethod: group.length > 1 ? "merge_key" : null,
          conflictNote: null,
          lastMergedAt: new Date(),
        }).returning();

        if (inserted) {
          let hasPrimary = false;
          for (const ch of group) {
            if (!ch.streamUrl) continue;

            const isPrimary = !hasPrimary;
            const [stream] = await tx.insert(channelStreams).values({
              canonicalChannelId: inserted.id,
              m3uSourceId: ch.m3uSourceId,
              rawChannelId: ch.rawChannelId,
              sourceChannelId: ch.id,
              streamUrl: ch.streamUrl,
              isPrimary,
              healthStatus: "unknown",
              responseTime: null,
              lastCheckedAt: null,
              lastSuccessAt: null,
              consecutiveFailures: 0,
              successRate: null,
              streamError: null,
            }).returning();

            if (stream && isPrimary) {
              hasPrimary = true;
              await tx.update(canonicalChannels).set({ primaryStreamId: stream.id }).where(eq(canonicalChannels.id, inserted.id));
            }
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
