/**
 * reconcileCanonicals — canonical channel rebuild logic, decoupled from EPG
 * matching (008-pipeline-reliability T015/T016).
 *
 * Extracted from epg-match.processor.ts L84-482 so it can be called after
 * M3U sync completes — without requiring a manual EPG match trigger. The
 * canonical channels, channel_streams, and canonical_epg_bindings are
 * generated/updated from the current channels table state.
 *
 * When called from EPG match, optional `epgUpdates` and `channelConflicts`
 * are provided so EPG binding info is included. When called from M3U sync,
 * both are empty → canonicals are built without EPG info (status=unmatched).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  channels,
  canonicalChannels,
  canonicalEpgBindings,
  channelOverrides,
  channelStreams,
  contentManifest,
  m3uSources,
} from "../schema";
import { computeMergeKey } from "@magi/backend-core";

export interface EpgUpdateEntry {
  channelId: string;
  epgChannelId: string;
  epgMatchType: string | null;
}

export interface ReconcileCanonicalsResult {
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
}

/**
 * Rebuild canonical channels, streams, and EPG bindings from the current
 * channels table state. Must be called inside the caller's transaction OR
 * standalone (it opens its own transaction).
 *
 * @param epgUpdates - EPG match results keyed by channelId (empty when called from M3U sync)
 * @param channelConflicts - channels with multi-source EPG conflicts (empty when called from M3U sync)
 * @param epgSourceId - the XMLTV source ID for EPG binding attribution (null when called from M3U sync)
 */
export async function reconcileCanonicals(
  epgUpdates: ReadonlyMap<string, EpgUpdateEntry> = new Map(),
  channelConflicts: ReadonlyMap<string, string> = new Map(),
  epgSourceId: string | null = null,
): Promise<ReconcileCanonicalsResult> {
  let createdCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;

  await db.transaction(async (tx) => {
    const allChannels = await tx.select().from(channels).limit(100000);

    // Load overrides indexed by channel identity (stable key)
    const overrideRows = await tx.select().from(channelOverrides);
    const overrideByIdentity = new Map<string, (typeof overrideRows)[0]>();
    for (const ov of overrideRows) {
      const ch = allChannels.find((c) => c.id === ov.channelId);
      if (ch) {
        overrideByIdentity.set(ch.channelIdentity, ov);
      } else {
        overrideByIdentity.set(ov.channelId, ov);
      }
    }

    // Load existing canonical channels
    const existingCanonical = await tx.select().from(canonicalChannels);
    const existingBindingRows = await tx.select().from(canonicalEpgBindings);
    const bindingByCanonicalId = new Map(
      existingBindingRows.map((b) => [b.canonicalChannelId, b]),
    );

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

    const activeIdentities = new Set(allChannels.map((ch) => ch.channelIdentity));

    // Step 1: Group channels by merge key
    const channelsByMergeKey = new Map<string, typeof allChannels>();
    for (const ch of allChannels) {
      const key = computeMergeKey({ tvgId: ch.tvgId, displayName: ch.displayName, groupTitle: ch.groupTitle });
      const arr = channelsByMergeKey.get(key) ?? [];
      arr.push(ch);
      channelsByMergeKey.set(key, arr);
    }

    // Step 2: Build mergeKey → existing canonicals mapping
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
      let resolvedChannel: (typeof allChannels)[0] | undefined;
      for (const id of identities) {
        const ch = allChannels.find((c) => c.channelIdentity === id);
        if (ch) { resolvedChannel = ch; break; }
        const chById = allChannels.find((c) => c.id === id);
        if (chById) { resolvedChannel = chById; break; }
      }
      if (resolvedChannel) {
        const key = computeMergeKey({ tvgId: resolvedChannel.tvgId, displayName: resolvedChannel.displayName, groupTitle: resolvedChannel.groupTitle });
        const arr = canonicalsByMergeKey.get(key) ?? [];
        arr.push(canon);
        canonicalsByMergeKey.set(key, arr);
      }
    }

    // Step 3: Deactivate canonicals whose all source identities disappeared
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
        deactivatedCount++;
      }
    }

    // Step 4: Upsert canonical channels per merge group
    for (const [, group] of channelsByMergeKey) {
      group.sort((a, b) => {
        const pa = a.m3uSourceId ? (sourcePriority.get(a.m3uSourceId) ?? 0) : 0;
        const pb = b.m3uSourceId ? (sourcePriority.get(b.m3uSourceId) ?? 0) : 0;
        return pb - pa;
      });
      const best = group[0]!;

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

      // Collect EPG info (empty when called from M3U sync without EPG data)
      let epgChannelId: string | null = null;
      let resolvedEpgSourceId: string | null = null;
      let epgMatchType: string | null = null;
      let epgStatus: string | null = null;

      if (ov?.manualEpgChannelId !== undefined && ov.manualEpgChannelId !== null) {
        epgChannelId = ov.manualEpgChannelId;
        resolvedEpgSourceId = ov.manualEpgSourceId ?? epgSourceId;
        epgMatchType = "manual";
        epgStatus = "matched_manual";
      } else {
        for (const ch of group) {
          const chOv = overrideByIdentity.get(ch.channelIdentity);
          if (chOv?.manualEpgChannelId) {
            epgChannelId = chOv.manualEpgChannelId;
            resolvedEpgSourceId = chOv.manualEpgSourceId ?? epgSourceId;
            epgMatchType = "manual";
            epgStatus = "matched_manual";
            break;
          }
          const conflictChannelId = channelConflicts.get(ch.id);
          if (conflictChannelId) {
            epgChannelId = conflictChannelId;
            resolvedEpgSourceId = null;
            epgMatchType = "conflict";
            epgStatus = "conflict";
            break;
          }
          const automatic = epgUpdates.get(ch.id);
          if (automatic && !epgChannelId) {
            epgChannelId = automatic.epgChannelId;
            resolvedEpgSourceId = epgSourceId;
            epgMatchType = automatic.epgMatchType;
            epgStatus = "matched_auto";
          }
        }
      }

      const mergedIdentities = JSON.stringify(group.map((g) => g.channelIdentity));
      const existingGroup = canonicalsByMergeKey.get(
        computeMergeKey({ tvgId: best.tvgId, displayName: best.displayName, groupTitle: best.groupTitle }),
      );

      if (existingGroup && existingGroup.length > 0) {
        const survivor = existingGroup.reduce((a, b) => {
          const aStreams = streamsByCanonicalId.get(a.id)?.length ?? 0;
          const bStreams = streamsByCanonicalId.get(b.id)?.length ?? 0;
          return aStreams >= bStreams ? a : b;
        });
        const lockedBinding = bindingByCanonicalId.get(survivor.id);
        if (lockedBinding?.locked) {
          epgChannelId = lockedBinding.xmltvChannelId;
          resolvedEpgSourceId = lockedBinding.xmltvSourceId;
          epgMatchType = lockedBinding.matchType;
          epgStatus = lockedBinding.status;
        }

        // Disable and migrate duplicates
        for (const canon of existingGroup) {
          if (canon.id === survivor.id) continue;
          const dupStreams = streamsByCanonicalId.get(canon.id) ?? [];
          for (const s of dupStreams) {
            await tx.update(channelStreams).set({ canonicalChannelId: survivor.id, isPrimary: false }).where(eq(channelStreams.id, s.id));
          }
          await tx.update(canonicalChannels).set({ disabled: true, outputStatus: "inactive" }).where(eq(canonicalChannels.id, canon.id));
        }

        // Normalize primary
        const survivorOwnStreams = streamsByCanonicalId.get(survivor.id) ?? [];
        const survivorPrimary = survivorOwnStreams.find((s) => s.isPrimary);
        const newPrimaryId = survivorPrimary?.id ?? null;
        for (const s of survivorOwnStreams) {
          if (s.isPrimary && s.id !== newPrimaryId) {
            await tx.update(channelStreams).set({ isPrimary: false }).where(eq(channelStreams.id, s.id));
          }
        }
        if (survivor.primaryStreamId !== newPrimaryId) {
          await tx.update(canonicalChannels).set({ primaryStreamId: newPrimaryId }).where(eq(canonicalChannels.id, survivor.id));
        }

        // Update survivor
        await tx.update(canonicalChannels).set({
          standardName, standardGroup, standardLogo, channelNumber, hidden, starred,
          disabled: false, epgChannelId, epgMatchType, epgStatus, outputStatus: "active",
          mergedFromIds: mergedIdentities, mergeMethod: group.length > 1 ? "merge_key" : null, lastMergedAt: new Date(),
        }).where(eq(canonicalChannels.id, survivor.id));
        updatedCount++;

        if (!lockedBinding?.locked) {
          const rawBindingStatus = epgChannelId
            ? epgStatus === "conflict" ? "conflict"
            : epgStatus === "matched_manual" ? "matched_manual" : "matched_auto"
            : "unmatched";
          // CHECK constraint: matched_* requires non-null xmltvSourceId.
          // If we have no sourceId (e.g., M3U-only reconcile without EPG
          // context), downgrade to unmatched to satisfy the constraint.
          const bindingStatus =
            (rawBindingStatus === "matched_manual" || rawBindingStatus === "matched_auto") && !resolvedEpgSourceId
              ? "unmatched"
              : rawBindingStatus;
          await tx.insert(canonicalEpgBindings).values({
            canonicalChannelId: survivor.id,
            xmltvSourceId: epgChannelId ? resolvedEpgSourceId : null,
            xmltvChannelId: epgChannelId,
            status: bindingStatus, matchType: epgMatchType,
            locked: ov?.manualEpgLocked ?? false, decisionReason: ov?.decisionReason ?? null,
          }).onConflictDoUpdate({
            target: canonicalEpgBindings.canonicalChannelId,
            set: {
              xmltvSourceId: epgChannelId ? resolvedEpgSourceId : null,
              xmltvChannelId: epgChannelId, status: bindingStatus, matchType: epgMatchType,
              locked: ov?.manualEpgLocked ?? false, decisionReason: ov?.decisionReason ?? null,
              version: (lockedBinding?.version ?? 0) + 1, updatedAt: new Date(),
            },
          });
        }

        // Create missing streams
        const allSurvivorStreams = await tx.select().from(channelStreams).where(eq(channelStreams.canonicalChannelId, survivor.id));
        const existingUrls = new Set(allSurvivorStreams.map((s) => s.streamUrl));
        let hasPrimary = allSurvivorStreams.some((s) => s.isPrimary);
        for (const ch of group) {
          if (!ch.streamUrl || existingUrls.has(ch.streamUrl)) continue;
          const isPrimary = !hasPrimary;
          const [stream] = await tx.insert(channelStreams).values({
            canonicalChannelId: survivor.id, m3uSourceId: ch.m3uSourceId, rawChannelId: ch.rawChannelId,
            sourceChannelId: ch.id, streamUrl: ch.streamUrl, isPrimary, healthStatus: "unknown",
          }).returning();
          if (stream && isPrimary) {
            hasPrimary = true;
            await tx.update(canonicalChannels).set({ primaryStreamId: stream.id }).where(eq(canonicalChannels.id, survivor.id));
          }
        }
      } else {
        // Insert new canonical
        const [inserted] = await tx.insert(canonicalChannels).values({
          standardName, standardGroup, standardLogo, channelNumber, hidden, starred,
          disabled: false, epgChannelId, epgMatchType, epgStatus, outputStatus: "active",
          qualityScore: null, primaryStreamId: null, mergedFromIds: mergedIdentities,
          mergeMethod: group.length > 1 ? "merge_key" : null, conflictNote: null, lastMergedAt: new Date(),
        }).returning();

        if (inserted) {
          createdCount++;
          await tx.insert(canonicalEpgBindings).values({
            canonicalChannelId: inserted.id,
            xmltvSourceId: epgChannelId ? resolvedEpgSourceId : null,
            xmltvChannelId: epgChannelId,
            status: (() => {
              const raw = epgChannelId ? (epgStatus === "conflict" ? "conflict" : epgStatus === "matched_manual" ? "matched_manual" : "matched_auto") : "unmatched";
              // CHECK constraint: matched_* requires non-null xmltvSourceId.
              if ((raw === "matched_manual" || raw === "matched_auto") && !resolvedEpgSourceId) return "unmatched";
              return raw;
            })(),
            matchType: epgMatchType, locked: ov?.manualEpgLocked ?? false, decisionReason: ov?.decisionReason ?? null,
          });
          let hasPrimary = false;
          for (const ch of group) {
            if (!ch.streamUrl) continue;
            const isPrimary = !hasPrimary;
            const [stream] = await tx.insert(channelStreams).values({
              canonicalChannelId: inserted.id, m3uSourceId: ch.m3uSourceId, rawChannelId: ch.rawChannelId,
              sourceChannelId: ch.id, streamUrl: ch.streamUrl, isPrimary, healthStatus: "unknown",
            }).returning();
            if (stream && isPrimary) {
              hasPrimary = true;
              await tx.update(canonicalChannels).set({ primaryStreamId: stream.id }).where(eq(canonicalChannels.id, inserted.id));
            }
          }
        }
      }
    }

    // Bump content manifest (catalog always changes; epg only when sourceId provided)
    await tx.insert(contentManifest).values({ id: 1, catalogRevision: 2, epgRevision: 2, updatedAt: new Date() }).onConflictDoUpdate({
      target: contentManifest.id,
      set: {
        catalogRevision: sql`${contentManifest.catalogRevision} + 1`,
        ...(epgSourceId ? { epgRevision: sql`${contentManifest.epgRevision} + 1` } : {}),
        updatedAt: new Date(),
      },
    });
  });

  return { createdCount, updatedCount, deactivatedCount };
}
