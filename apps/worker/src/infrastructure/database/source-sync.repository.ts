/**
 * Drizzle adapter for ISourceSyncRepository (008-pipeline-reliability T006).
 *
 * Provides M3U source sync operations: loading source metadata, staging
 * import snapshots, stable upsert (preserving operator/health columns),
 * marking missing channels, and recording sync status.
 */
import { eq, inArray, notInArray, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db";
import {
  m3uSources,
  channels,
  sourceImportSnapshots,
  sourceImportSnapshotItems,
} from "../../schema";
import type {
  ISourceSyncRepository,
  SourceSnapshotInput,
  ParsedSourceChannel,
  CurrentSourceChannel,
} from "@/domain/source-sync";

export class DrizzleSourceSyncRepository implements ISourceSyncRepository {
  async loadSource(sourceId: string): Promise<SourceSnapshotInput | null> {
    const [row] = await db
      .select()
      .from(m3uSources)
      .where(eq(m3uSources.id, sourceId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      headers: row.headers as Record<string, string> | null,
      enabled: row.enabled,
      freshnessThresholdMinutes: row.freshnessThresholdMinutes ?? 60,
      version: row.version ?? 1,
    };
  }

  async stageSnapshot(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<{ snapshotId: string; itemCount: number }> {
    const snapshotId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

    await db.insert(sourceImportSnapshots).values({
      id: snapshotId,
      sourceId,
      sourceType,
      contentFingerprint,
      sourceVersion,
      status: "ready",
      itemCount: items.length,
      parserVersion: "1",
      preparedTaskId,
      createdAt: now,
      expiresAt,
    });

    if (items.length > 0) {
      const itemRows = items.map((item, index) => ({
        id: randomUUID(),
        snapshotId,
        channelIdentity: item.channelIdentity,
        collisionOrdinal: 0,
        itemOrder: index,
        payload: {
          displayName: item.displayName,
          groupTitle: item.groupTitle,
          tvgId: item.tvgId,
          tvgLogo: item.tvgLogo,
          streamUrl: item.streamUrl,
        },
        checksum: `${item.channelIdentity}:${contentFingerprint}`,
      }));
      await db.insert(sourceImportSnapshotItems).values(itemRows);
    }

    return { snapshotId, itemCount: items.length };
  }

  async loadCurrentChannels(sourceId: string): Promise<CurrentSourceChannel[]> {
    const rows = await db
      .select({
        id: channels.id,
        channelIdentity: channels.channelIdentity,
        displayName: channels.displayName,
        sourcePresence: channels.sourcePresence,
        version: channels.version,
      })
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId));
    return rows.map((r) => ({
      id: r.id,
      channelIdentity: r.channelIdentity,
      displayName: r.displayName,
      sourcePresence: r.sourcePresence ?? "present",
      version: r.version ?? 1,
    }));
  }

  async stableUpsert(
    sourceId: string,
    channel: ParsedSourceChannel,
  ): Promise<{ id: string; created: boolean }> {
    const now = new Date();
    const [existing] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.channelIdentity, channel.channelIdentity))
      .limit(1);

    if (existing) {
      // Update display fields only — preserve operator/health columns.
      await db
        .update(channels)
        .set({
          displayName: channel.displayName,
          groupTitle: channel.groupTitle,
          tvgId: channel.tvgId,
          tvgLogo: channel.tvgLogo,
          streamUrl: channel.streamUrl,
          sourcePresence: "present",
          lastSeenAt: now,
          missingSince: null,
        })
        .where(eq(channels.id, existing.id));
      return { id: existing.id, created: false };
    }

    const [row] = await db
      .insert(channels)
      .values({
        channelIdentity: channel.channelIdentity,
        m3uSourceId: sourceId,
        displayName: channel.displayName,
        groupTitle: channel.groupTitle,
        tvgId: channel.tvgId,
        tvgLogo: channel.tvgLogo,
        streamUrl: channel.streamUrl,
        sourcePresence: "present",
        firstSeenAt: now,
        lastSeenAt: now,
        active: true,
      })
      .returning({ id: channels.id });
    return { id: row!.id, created: true };
  }

  async markMissing(sourceId: string, presentIdentities: readonly string[], now: Date): Promise<number> {
    if (presentIdentities.length === 0) {
      const result = await db
        .update(channels)
        .set({ sourcePresence: "missing", missingSince: now })
        .where(and(eq(channels.m3uSourceId, sourceId), eq(channels.sourcePresence, "present")))
        .returning({ id: channels.id });
      return result.length;
    }

    const result = await db
      .update(channels)
      .set({ sourcePresence: "missing", missingSince: now })
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          eq(channels.sourcePresence, "present"),
          notInArray(channels.channelIdentity, [...presentIdentities]),
        ),
      )
      .returning({ id: channels.id });
    return result.length;
  }

  async recordSourceSync(
    sourceId: string,
    status: "success" | "failed",
    contentFingerprint: string | null,
  ): Promise<void> {
    await db
      .update(m3uSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastContentFingerprint: contentFingerprint,
      })
      .where(eq(m3uSources.id, sourceId));
  }
}
