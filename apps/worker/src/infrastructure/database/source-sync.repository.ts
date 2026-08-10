/**
 * Drizzle adapter for ISourceSyncRepository (008-pipeline-reliability T006,
 * extended by 009-m3u-control-plane T009).
 *
 * Provides M3U source sync operations: loading source metadata, staging
 * import snapshots, stable upsert (preserving operator/health columns),
 * marking missing channels, recording sync status, and the new atomic apply
 * + reappearance/purge paths introduced by 009.
 */
import {
  eq,
  gt,
  inArray,
  notInArray,
  and,
  or,
  sql,
  lt,
  isNotNull,
  isNull,
} from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { chunk, safeBatchSize } from "@magi/utils";
import { db } from "../../db";
import {
  m3uSources,
  channels,
  sourceImportSnapshots,
  sourceImportSnapshotItems,
  channelStreams,
  rawM3uChannels,
  xmltvSources,
  programmes,
  canonicalEpgBindings,
  canonicalChannelMembers,
  scheduledJobConfigs,
  channelOverrides,
  sourceChannelIdentityAliases,
  canonicalChannels,
  recoveryPoints,
  recoveryPointItems,
  operationChangeSets,
  rawXmltvChannels,
} from "../../schema";
import type {
  ISourceSyncRepository,
  SourceSnapshotInput,
  ParsedSourceChannel,
  CurrentSourceChannel,
  StageSnapshotResult,
  ReconcileApplyResult,
  SourceDeleteImpact,
  SourceDeleteResult,
} from "@/domain/source-sync";

type SourceDeleteTarget = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: "m3u" | "xmltv";
  readonly sourceVersion: number;
};

type SourceSyncTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

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
    return db.transaction((tx) =>
      this.insertSnapshotInTransaction(tx, {
        sourceId,
        sourceType,
        contentFingerprint,
        sourceVersion,
        items,
        preparedTaskId,
      }),
    );
  }

  private async insertSnapshotInTransaction(
    tx: SourceSyncTransaction,
    input: {
      sourceId: string;
      sourceType: "m3u" | "xmltv";
      contentFingerprint: string;
      sourceVersion: number;
      items: readonly ParsedSourceChannel[];
      preparedTaskId: string;
    },
  ): Promise<{ snapshotId: string; itemCount: number }> {
    const snapshotId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const collisionOrdinals = new Map<string, number>();
    const itemRows = input.items.map((item, index) => {
      const collisionOrdinal = collisionOrdinals.get(item.channelIdentity) ?? 0;
      collisionOrdinals.set(item.channelIdentity, collisionOrdinal + 1);
      return {
        id: randomUUID(),
        snapshotId,
        channelIdentity: item.channelIdentity,
        collisionOrdinal,
        itemOrder: index,
        payload: {
          displayName: item.displayName,
          groupTitle: item.groupTitle,
          tvgId: item.tvgId,
          tvgLogo: item.tvgLogo,
          streamUrl: item.streamUrl,
        },
        checksum: `sha256:${createHash("sha256").update(`${item.channelIdentity}:${input.contentFingerprint}`).digest("hex").slice(0, 64)}`,
      };
    });

    await tx.insert(sourceImportSnapshots).values({
      id: snapshotId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      contentFingerprint: input.contentFingerprint,
      sourceVersion: input.sourceVersion,
      status: "ready",
      itemCount: input.items.length,
      parserVersion: "1",
      preparedTaskId: input.preparedTaskId,
      createdAt: now,
      expiresAt,
    });

    for (const batch of chunk(itemRows, safeBatchSize(7))) {
      await tx.insert(sourceImportSnapshotItems).values(batch);
    }

    return { snapshotId, itemCount: input.items.length };
  }

  async loadCurrentChannels(sourceId: string): Promise<CurrentSourceChannel[]> {
    const rows = await db
      .select({
        id: channels.id,
        channelIdentity: channels.channelIdentity,
        displayName: channels.displayName,
        groupTitle: channels.groupTitle,
        streamUrl: channels.streamUrl,
        sourcePresence: channels.sourcePresence,
        version: channels.version,
        tvgId: channels.tvgId,
      })
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId));
    return rows.map((r) => ({
      id: r.id,
      channelIdentity: r.channelIdentity,
      displayName: r.displayName,
      groupTitle: r.groupTitle ?? null,
      streamUrl: r.streamUrl ?? null,
      sourcePresence: r.sourcePresence ?? "present",
      version: r.version ?? 1,
      tvgId: r.tvgId,
    }));
  }

  async stableUpsert(
    sourceId: string,
    channel: ParsedSourceChannel,
  ): Promise<{ id: string; created: boolean }> {
    const now = new Date();
    const [existing] = await db
      .select({ id: channels.id, m3uSourceId: channels.m3uSourceId })
      .from(channels)
      .where(eq(channels.channelIdentity, channel.channelIdentity))
      .limit(1);

    if (existing) {
      if (existing.m3uSourceId && existing.m3uSourceId !== sourceId) {
        throw new Error(
          `Channel identity belongs to another source: ${channel.channelIdentity}`,
        );
      }
      // Update display fields only — preserve operator/health columns.
      await db
        .update(channels)
        .set({
          m3uSourceId: sourceId,
          displayName: channel.displayName,
          groupTitle: channel.groupTitle,
          tvgId: channel.tvgId,
          tvgLogo: channel.tvgLogo,
          streamUrl: channel.streamUrl,
          sourcePresence: "present",
          lastSeenAt: now,
          missingSince: null,
          version: sql`${channels.version} + 1`,
          updatedAt: now,
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

  async markMissing(
    sourceId: string,
    presentIdentities: readonly string[],
    now: Date,
  ): Promise<number> {
    if (presentIdentities.length === 0) {
      const result = await db
        .update(channels)
        .set({
          sourcePresence: "missing",
          missingSince: now,
          version: sql`${channels.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(channels.m3uSourceId, sourceId),
            eq(channels.sourcePresence, "present"),
          ),
        )
        .returning({ id: channels.id });
      return result.length;
    }

    const result = await db
      .update(channels)
      .set({
        sourcePresence: "missing",
        missingSince: now,
        version: sql`${channels.version} + 1`,
        updatedAt: now,
      })
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

  // -------------------------------------------------------------------------
  // 009-m3u-control-plane (T009): idempotent snapshot staging, atomic apply,
  // reappearance, and 30-day purge.
  // -------------------------------------------------------------------------
  async stageSnapshotIdempotent(
    sourceId: string,
    sourceType: "m3u" | "xmltv",
    contentFingerprint: string,
    sourceVersion: number,
    items: readonly ParsedSourceChannel[],
    preparedTaskId: string,
  ): Promise<StageSnapshotResult> {
    // The old unique index prevented a fingerprint from ever recurring after
    // expiry. Serialize prepares for a source row instead, then reuse only an
    // unexpired snapshot; an expired row remains immutable history.
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from m3u_sources where id = ${sourceId} for update`,
      );
      const now = new Date();
      const [existing] = await tx
        .select({
          id: sourceImportSnapshots.id,
          itemCount: sourceImportSnapshots.itemCount,
        })
        .from(sourceImportSnapshots)
        .where(
          and(
            eq(sourceImportSnapshots.sourceId, sourceId),
            eq(sourceImportSnapshots.contentFingerprint, contentFingerprint),
            eq(sourceImportSnapshots.sourceVersion, sourceVersion),
            gt(sourceImportSnapshots.expiresAt, now),
          ),
        )
        .orderBy(sourceImportSnapshots.createdAt)
        .limit(1);
      if (existing) {
        return {
          snapshotId: existing.id,
          itemCount: existing.itemCount,
          reused: true,
        };
      }
      const staged = await this.insertSnapshotInTransaction(tx, {
        sourceId,
        sourceType,
        contentFingerprint,
        sourceVersion,
        items,
        preparedTaskId,
      });
      return { ...staged, reused: false };
    });
  }

  async loadPresentChannels(sourceId: string): Promise<CurrentSourceChannel[]> {
    const rows = await db
      .select({
        id: channels.id,
        channelIdentity: channels.channelIdentity,
        displayName: channels.displayName,
        groupTitle: channels.groupTitle,
        streamUrl: channels.streamUrl,
        sourcePresence: channels.sourcePresence,
        version: channels.version,
        tvgId: channels.tvgId,
      })
      .from(channels)
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          eq(channels.sourcePresence, "present"),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      channelIdentity: r.channelIdentity,
      displayName: r.displayName,
      groupTitle: r.groupTitle ?? null,
      streamUrl: r.streamUrl ?? null,
      sourcePresence: r.sourcePresence ?? "present",
      version: r.version ?? 1,
      tvgId: r.tvgId,
    }));
  }

  async applyAtomic(input: {
    readonly sourceId: string;
    readonly snapshotId: string;
    readonly changeSetId: string;
    readonly presentChannels: readonly ParsedSourceChannel[];
    readonly missingSourceChannelIds: readonly string[];
    readonly restoreSourceChannelIds?: readonly string[];
    readonly contentFingerprint: string;
    readonly sourceVersion: number;
    readonly now: Date;
    readonly recoveryPointId?: string;
  }): Promise<ReconcileApplyResult> {
    // The entire apply — stable upsert, missing marking, stream hiding, and
    // source-status update — runs in a single transaction. A failure in any
    // step rolls back all prior writes so the source never ends up in a
    // partially-applied state with lastSyncStatus="success".
    return db.transaction(async (tx) => {
      let sourcesActivated = 0;
      let sourcesDeactivated = 0;
      let streamsMissing = 0;
      let streamsRestored = 0;

      const [source] = await tx
        .select({ version: m3uSources.version })
        .from(m3uSources)
        .where(eq(m3uSources.id, input.sourceId))
        .limit(1);
      if (!source) throw new Error("Source not found");
      if ((source.version ?? 1) !== input.sourceVersion) {
        throw new Error(
          `Stale source version: expected ${input.sourceVersion}, current ${source.version ?? 1}`,
        );
      }

      const [snapshot] = await tx
        .select({
          sourceId: sourceImportSnapshots.sourceId,
          sourceVersion: sourceImportSnapshots.sourceVersion,
          contentFingerprint: sourceImportSnapshots.contentFingerprint,
          status: sourceImportSnapshots.status,
          expiresAt: sourceImportSnapshots.expiresAt,
        })
        .from(sourceImportSnapshots)
        .where(eq(sourceImportSnapshots.id, input.snapshotId))
        .limit(1);
      if (!snapshot || snapshot.sourceId !== input.sourceId) {
        throw new Error("Snapshot not found for source");
      }
      if (snapshot.status !== "ready" || snapshot.expiresAt <= input.now) {
        throw new Error("Snapshot is expired or not ready");
      }
      if (
        snapshot.sourceVersion !== input.sourceVersion ||
        snapshot.contentFingerprint !== input.contentFingerprint
      ) {
        throw new Error("Snapshot precondition mismatch");
      }

      const [changeSet] = await tx
        .select({
          sourceId: operationChangeSets.sourceId,
          snapshotId: operationChangeSets.snapshotId,
          status: operationChangeSets.status,
        })
        .from(operationChangeSets)
        .where(eq(operationChangeSets.id, input.changeSetId))
        .limit(1);
      if (
        !changeSet ||
        changeSet.sourceId !== input.sourceId ||
        changeSet.snapshotId !== input.snapshotId ||
        !["ready", "applying"].includes(changeSet.status)
      ) {
        throw new Error("Change set precondition mismatch");
      }

      if (input.recoveryPointId) {
        await this.captureRecoveryState(
          tx,
          input.sourceId,
          input.changeSetId,
          input.recoveryPointId,
        );
      }

      // A source row that reappeared (or was purged and later returned) is
      // restored before the stable upsert. This is deliberately in this
      // transaction; a failure below must not leave a restored-only state.
      if (
        input.restoreSourceChannelIds &&
        input.restoreSourceChannelIds.length > 0
      ) {
        await tx
          .update(channels)
          .set({
            sourcePresence: "present",
            missingSince: null,
            lastSeenAt: input.now,
            version: sql`${channels.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(channels.m3uSourceId, input.sourceId),
              inArray(channels.id, [...input.restoreSourceChannelIds]),
              inArray(channels.sourcePresence, ["missing", "purged"]),
            ),
          );
      }

      // 1. Stable upsert present channels (preserves operator/health columns).
      for (const channel of input.presentChannels) {
        const [existing] = await tx
          .select({ id: channels.id, m3uSourceId: channels.m3uSourceId })
          .from(channels)
          .where(eq(channels.channelIdentity, channel.channelIdentity))
          .limit(1);

        if (existing) {
          if (existing.m3uSourceId && existing.m3uSourceId !== input.sourceId) {
            throw new Error(
              `Channel identity belongs to another source: ${channel.channelIdentity}`,
            );
          }
          await tx
            .update(channels)
            .set({
              m3uSourceId: input.sourceId,
              displayName: channel.displayName,
              groupTitle: channel.groupTitle,
              tvgId: channel.tvgId,
              tvgLogo: channel.tvgLogo,
              streamUrl: channel.streamUrl,
              sourceRevision: input.contentFingerprint,
              sourcePresence: "present",
              lastSeenAt: input.now,
              missingSince: null,
              version: sql`${channels.version} + 1`,
              updatedAt: input.now,
            })
            .where(eq(channels.id, existing.id));
        } else {
          const [created] = await tx
            .insert(channels)
            .values({
              channelIdentity: channel.channelIdentity,
              m3uSourceId: input.sourceId,
              displayName: channel.displayName,
              groupTitle: channel.groupTitle,
              tvgId: channel.tvgId,
              tvgLogo: channel.tvgLogo,
              streamUrl: channel.streamUrl,
              sourceRevision: input.contentFingerprint,
              sourcePresence: "present",
              firstSeenAt: input.now,
              lastSeenAt: input.now,
              active: true,
            })
            .returning({ id: channels.id });
          sourcesActivated++;
          if (!created) throw new Error("Failed to create source channel");
        }

        const channelId =
          existing?.id ??
          (
            await tx
              .select({ id: channels.id })
              .from(channels)
              .where(eq(channels.channelIdentity, channel.channelIdentity))
              .limit(1)
          )[0]?.id;
        if (channelId) {
          // Source-derived stream visibility follows the source-channel
          // relationship. rawChannelId belongs to raw_m3u_channels and must
          // never be compared with channels.id.
          const restored = await tx
            .update(channelStreams)
            .set({
              missingSince: null,
              purgedAt: null,
              version: sql`${channelStreams.version} + 1`,
              updatedAt: input.now,
            })
            .where(
              and(
                eq(channelStreams.sourceChannelId, channelId),
                or(
                  isNotNull(channelStreams.missingSince),
                  isNotNull(channelStreams.purgedAt),
                ),
              ),
            )
            .returning({ id: channelStreams.id });
          streamsRestored += restored.length;
        }
      }

      // 2. Mark missing channels + bump their missingSince if first time.
      if (input.missingSourceChannelIds.length > 0) {
        const newlyMissing = await tx
          .update(channels)
          .set({
            sourcePresence: "missing",
            missingSince: input.now,
            version: sql`${channels.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(channels.m3uSourceId, input.sourceId),
              inArray(channels.id, [...input.missingSourceChannelIds]),
              eq(channels.sourcePresence, "present"),
            ),
          )
          .returning({ id: channels.id });
        sourcesDeactivated = newlyMissing.length;

        // Hide source-derived streams bound to those channels from output.
        const hiddenStreams = await tx
          .update(channelStreams)
          .set({
            missingSince: input.now,
            purgedAt: null,
            version: sql`${channelStreams.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              inArray(channelStreams.sourceChannelId, [
                ...input.missingSourceChannelIds,
              ]),
              isNotNull(channelStreams.sourceChannelId),
              or(
                eq(channelStreams.origin, "source"),
                isNull(channelStreams.origin),
              ),
              isNull(channelStreams.missingSince),
              isNull(channelStreams.purgedAt),
            ),
          )
          .returning({ id: channelStreams.id });
        streamsMissing = hiddenStreams.length;
      }

      // 3. Record source sync success + fingerprint.
      const updatedSource = await tx
        .update(m3uSources)
        .set({
          lastSyncAt: input.now,
          lastSyncStatus: "success",
          lastContentFingerprint: input.contentFingerprint,
        })
        .where(
          and(
            eq(m3uSources.id, input.sourceId),
            eq(m3uSources.version, input.sourceVersion),
          ),
        )
        .returning({ id: m3uSources.id });
      if (updatedSource.length === 0) {
        throw new Error("Source changed while applying snapshot");
      }

      return {
        sourcesActivated,
        sourcesDeactivated,
        streamsMissing,
        streamsRestored,
      };
    });
  }

  /**
   * Capture the source-scoped pre-apply graph while the apply transaction still
   * holds its locks. API-originated applies create the recovery-point header in
   * advance; this fills its immutable items exactly once.
   */
  private async captureRecoveryState(
    tx: SourceSyncTransaction,
    sourceId: string,
    changeSetId: string,
    recoveryPointId: string,
  ): Promise<void> {
    const [recoveryPoint] = await tx
      .select({
        status: recoveryPoints.status,
        changeSetId: recoveryPoints.changeSetId,
      })
      .from(recoveryPoints)
      .where(eq(recoveryPoints.id, recoveryPointId))
      .limit(1);
    if (!recoveryPoint) throw new Error("Recovery point not found");
    if (
      recoveryPoint.changeSetId !== null &&
      recoveryPoint.changeSetId !== changeSetId
    ) {
      throw new Error("Recovery point does not belong to change set");
    }
    if (
      recoveryPoint.status === "expired" ||
      recoveryPoint.status === "invalid" ||
      recoveryPoint.status === "restored"
    ) {
      throw new Error("Recovery point is not writable");
    }

    const existingItems = await tx
      .select({ id: recoveryPointItems.id })
      .from(recoveryPointItems)
      .where(eq(recoveryPointItems.recoveryPointId, recoveryPointId))
      .limit(1);
    if (existingItems.length > 0) return;

    const rawChannels = await tx
      .select()
      .from(rawM3uChannels)
      .where(eq(rawM3uChannels.sourceId, sourceId));
    const sourceChannelsById = new Map<string, typeof channels.$inferSelect>();
    for (const row of await tx
      .select()
      .from(channels)
      .where(eq(channels.m3uSourceId, sourceId))) {
      sourceChannelsById.set(row.id, row);
    }
    const rawChannelIds = rawChannels.map((row) => row.id);
    if (rawChannelIds.length > 0) {
      for (const row of await tx
        .select()
        .from(channels)
        .where(inArray(channels.rawChannelId, rawChannelIds))) {
        sourceChannelsById.set(row.id, row);
      }
    }
    const sourceChannels = [...sourceChannelsById.values()];
    const [m3uSource] = await tx
      .select()
      .from(m3uSources)
      .where(eq(m3uSources.id, sourceId))
      .limit(1);
    if (!m3uSource) {
      const [xmltvSource] = await tx
        .select()
        .from(xmltvSources)
        .where(eq(xmltvSources.id, sourceId))
        .limit(1);
      if (!xmltvSource) throw new Error("Source not found");

      const rawXmltv = await tx
        .select()
        .from(rawXmltvChannels)
        .where(eq(rawXmltvChannels.sourceId, sourceId));
      const sourceProgrammes = await tx
        .select()
        .from(programmes)
        .where(eq(programmes.sourceId, sourceId));
      const bindings = await tx
        .select()
        .from(canonicalEpgBindings)
        .where(eq(canonicalEpgBindings.xmltvSourceId, sourceId));
      const schedules = await tx
        .select()
        .from(scheduledJobConfigs)
        .where(
          and(
            eq(scheduledJobConfigs.scopeType, "source"),
            eq(scheduledJobConfigs.scopeId, sourceId),
          ),
        );
      const captured: Array<{
        entityType: string;
        entityId: string;
        entityVersion: number;
        payload: Record<string, unknown>;
      }> = [];
      const add = (
        entityType: string,
        entityId: string,
        entityVersion: number,
        payload: Record<string, unknown>,
      ) =>
        captured.push({
          entityType,
          entityId,
          entityVersion,
          payload: JSON.parse(JSON.stringify(payload)) as Record<
            string,
            unknown
          >,
        });
      add(
        "xmltv_source",
        xmltvSource.id,
        xmltvSource.version ?? 1,
        xmltvSource as unknown as Record<string, unknown>,
      );
      for (const row of rawXmltv)
        add(
          "raw_xmltv_channel",
          row.id,
          1,
          row as unknown as Record<string, unknown>,
        );
      for (const row of sourceProgrammes)
        add("programme", row.id, 1, row as unknown as Record<string, unknown>);
      for (const row of bindings)
        add(
          "canonical_epg_binding",
          row.canonicalChannelId,
          row.version ?? 1,
          row as unknown as Record<string, unknown>,
        );
      for (const row of schedules)
        add(
          "scheduled_job_config",
          row.id,
          row.version ?? 1,
          row as unknown as Record<string, unknown>,
        );

      const checksumSource = captured
        .map((row) => `${row.entityType}:${row.entityId}:${row.entityVersion}`)
        .sort()
        .join("|");
      const checksum = `rp:${createHash("sha256").update(checksumSource).digest("hex")}`;
      for (const [itemOrder, item] of captured.entries()) {
        await tx.insert(recoveryPointItems).values({
          recoveryPointId,
          entityType: item.entityType,
          entityId: item.entityId,
          entityVersion: item.entityVersion,
          payload: item.payload,
          itemOrder,
          checksum: `${item.entityType}:${item.entityId}`,
        });
      }
      await tx
        .update(recoveryPoints)
        .set({ status: "ready", itemCount: captured.length, checksum })
        .where(eq(recoveryPoints.id, recoveryPointId));
      return;
    }
    const sourceChannelIds = sourceChannels.map((row) => row.id);
    const overrides =
      sourceChannelIds.length > 0
        ? await tx
            .select()
            .from(channelOverrides)
            .where(inArray(channelOverrides.channelId, sourceChannelIds))
        : [];
    const schedules = await tx
      .select()
      .from(scheduledJobConfigs)
      .where(
        and(
          eq(scheduledJobConfigs.scopeType, "source"),
          eq(scheduledJobConfigs.scopeId, sourceId),
        ),
      );
    const identityAliases = await tx
      .select()
      .from(sourceChannelIdentityAliases)
      .where(eq(sourceChannelIdentityAliases.sourceId, sourceId));

    const streams =
      sourceChannelIds.length > 0
        ? await tx
            .select()
            .from(channelStreams)
            .where(
              or(
                eq(channelStreams.m3uSourceId, sourceId),
                inArray(channelStreams.sourceChannelId, sourceChannelIds),
              ),
            )
        : await tx
            .select()
            .from(channelStreams)
            .where(eq(channelStreams.m3uSourceId, sourceId));

    const memberships =
      sourceChannelIds.length > 0
        ? await tx
            .select()
            .from(canonicalChannelMembers)
            .where(
              inArray(
                canonicalChannelMembers.sourceChannelId,
                sourceChannelIds,
              ),
            )
        : [];
    const canonicalIds = [
      ...new Set([
        ...memberships.map((row) => row.canonicalChannelId),
        ...streams.map((row) => row.canonicalChannelId),
      ]),
    ];
    const canonicals =
      canonicalIds.length > 0
        ? await tx
            .select()
            .from(canonicalChannels)
            .where(inArray(canonicalChannels.id, canonicalIds))
        : [];

    const captured: Array<{
      entityType: string;
      entityId: string;
      entityVersion: number;
      payload: Record<string, unknown>;
    }> = [];
    const add = (
      entityType: string,
      entityId: string,
      entityVersion: number,
      payload: Record<string, unknown>,
    ) =>
      captured.push({
        entityType,
        entityId,
        entityVersion,
        payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
      });

    if (m3uSource) {
      add(
        "m3u_source",
        m3uSource.id,
        m3uSource.version ?? 1,
        m3uSource as unknown as Record<string, unknown>,
      );
    }

    for (const row of canonicals)
      add(
        "canonical_channel",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of rawChannels)
      add(
        "raw_m3u_channel",
        row.id,
        1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of sourceChannels)
      add(
        "channel",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of overrides)
      add(
        "channel_override",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of streams)
      add(
        "channel_stream",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of memberships)
      add(
        "canonical_channel_member",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of schedules)
      add(
        "scheduled_job_config",
        row.id,
        row.version ?? 1,
        row as unknown as Record<string, unknown>,
      );
    for (const row of identityAliases)
      add(
        "source_channel_identity_alias",
        row.id,
        1,
        row as unknown as Record<string, unknown>,
      );

    const checksumSource = captured
      .map((row) => `${row.entityType}:${row.entityId}:${row.entityVersion}`)
      .sort()
      .join("|");
    const checksum = `rp:${createHash("sha256").update(checksumSource).digest("hex")}`;
    for (const [itemOrder, item] of captured.entries()) {
      await tx.insert(recoveryPointItems).values({
        recoveryPointId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityVersion: item.entityVersion,
        payload: item.payload,
        itemOrder,
        checksum: `${item.entityType}:${item.entityId}`,
      });
    }
    await tx
      .update(recoveryPoints)
      .set({ status: "ready", itemCount: captured.length, checksum })
      .where(eq(recoveryPoints.id, recoveryPointId));
  }

  async restoreMissing(
    sourceId: string,
    sourceChannelIds: readonly string[],
    now: Date,
  ): Promise<number> {
    if (sourceChannelIds.length === 0) return 0;
    const restoredChannels = await db
      .update(channels)
      .set({
        sourcePresence: "present",
        missingSince: null,
        lastSeenAt: now,
        version: sql`${channels.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(channels.m3uSourceId, sourceId),
          inArray(channels.id, [...sourceChannelIds]),
          inArray(channels.sourcePresence, ["missing", "purged"]),
        ),
      )
      .returning({ id: channels.id });

    if (restoredChannels.length > 0) {
      await db
        .update(channelStreams)
        .set({
          missingSince: null,
          purgedAt: null,
          version: sql`${channelStreams.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            inArray(
              channelStreams.sourceChannelId,
              restoredChannels.map((r) => r.id),
            ),
            or(
              isNotNull(channelStreams.missingSince),
              isNotNull(channelStreams.purgedAt),
            ),
          ),
        );
    }
    return restoredChannels.length;
  }

  async purgeExpiredMissing(
    sourceId: string | null,
    retentionSeconds: number,
    now: Date,
  ): Promise<{ purgedSourceChannels: number; purgedStreams: number }> {
    const cutoff = new Date(now.getTime() - retentionSeconds * 1000);
    const sourceCondition = sourceId
      ? eq(channels.m3uSourceId, sourceId)
      : sql`true`;
    const purgedChannels = await db
      .update(channels)
      .set({
        sourcePresence: "purged",
        version: sql`${channels.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          sourceCondition,
          eq(channels.sourcePresence, "missing"),
          lt(channels.missingSince, cutoff),
        ),
      )
      .returning({ id: channels.id });

    let purgedStreams = 0;
    if (purgedChannels.length > 0) {
      const channelIds = purgedChannels.map((c) => c.id);
      const streamsResult = await db
        .update(channelStreams)
        .set({
          missingSince: null,
          purgedAt: now,
          version: sql`${channelStreams.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            inArray(channelStreams.sourceChannelId, channelIds),
            isNotNull(channelStreams.sourceChannelId),
            or(
              eq(channelStreams.origin, "source"),
              isNull(channelStreams.origin),
            ),
            isNull(channelStreams.purgedAt),
          ),
        )
        .returning({ id: channelStreams.id });
      purgedStreams = streamsResult.length;
    }

    return {
      purgedSourceChannels: purgedChannels.length,
      purgedStreams,
    };
  }

  /**
   * Resolve a source-delete target without applying the sync source guard.
   * Disabled sources are still valid delete targets; a missing source is the
   * only invalid scope.
   */
  private async findSourceDeleteTarget(
    sourceId: string,
  ): Promise<SourceDeleteTarget | null> {
    const [m3u, xmltv] = await Promise.all([
      db
        .select({
          id: m3uSources.id,
          name: m3uSources.name,
          version: m3uSources.version,
        })
        .from(m3uSources)
        .where(eq(m3uSources.id, sourceId))
        .limit(1),
      db
        .select({
          id: xmltvSources.id,
          name: xmltvSources.name,
          version: xmltvSources.version,
        })
        .from(xmltvSources)
        .where(eq(xmltvSources.id, sourceId))
        .limit(1),
    ]);
    if (m3u[0]) {
      return {
        sourceId: m3u[0].id,
        sourceName: m3u[0].name,
        sourceType: "m3u",
        sourceVersion: m3u[0].version ?? 1,
      };
    }
    if (xmltv[0]) {
      return {
        sourceId: xmltv[0].id,
        sourceName: xmltv[0].name,
        sourceType: "xmltv",
        sourceVersion: xmltv[0].version ?? 1,
      };
    }
    return null;
  }

  async prepareSourceDelete(sourceId: string): Promise<SourceDeleteImpact> {
    const target = await this.findSourceDeleteTarget(sourceId);
    if (!target) throw new Error("Source not found");

    if (target.sourceType === "m3u") {
      const [raw, channelsForSource, memberships, streams, schedules] =
        await Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(rawM3uChannels)
            .where(eq(rawM3uChannels.sourceId, sourceId)),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(channels)
            .leftJoin(
              rawM3uChannels,
              eq(channels.rawChannelId, rawM3uChannels.id),
            )
            .where(
              or(
                eq(channels.m3uSourceId, sourceId),
                eq(rawM3uChannels.sourceId, sourceId),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(canonicalChannelMembers)
            .innerJoin(
              channels,
              eq(canonicalChannelMembers.sourceChannelId, channels.id),
            )
            .leftJoin(
              rawM3uChannels,
              eq(channels.rawChannelId, rawM3uChannels.id),
            )
            .where(
              or(
                eq(channels.m3uSourceId, sourceId),
                eq(rawM3uChannels.sourceId, sourceId),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(channelStreams)
            .leftJoin(channels, eq(channelStreams.sourceChannelId, channels.id))
            .leftJoin(
              rawM3uChannels,
              eq(channelStreams.rawChannelId, rawM3uChannels.id),
            )
            .where(
              or(
                eq(channelStreams.m3uSourceId, sourceId),
                eq(channels.m3uSourceId, sourceId),
                eq(rawM3uChannels.sourceId, sourceId),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(scheduledJobConfigs)
            .where(
              and(
                eq(scheduledJobConfigs.scopeType, "source"),
                eq(scheduledJobConfigs.scopeId, sourceId),
              ),
            ),
        ]);

      return {
        sourceId,
        sourceName: target.sourceName,
        sourceType: target.sourceType,
        sourceVersion: target.sourceVersion,
        counts: {
          rawChannels: Number(raw[0]?.count ?? 0),
          channels: Number(channelsForSource[0]?.count ?? 0),
          programmes: 0,
          epgMappings: 0,
          canonicalMemberships: Number(memberships[0]?.count ?? 0),
          streams: Number(streams[0]?.count ?? 0),
          schedules: Number(schedules[0]?.count ?? 0),
        },
      };
    }

    const [rawChannelsForSource, programmesForSource, epgMappings, schedules] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(rawXmltvChannels)
          .where(eq(rawXmltvChannels.sourceId, sourceId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(programmes)
          .where(eq(programmes.sourceId, sourceId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(canonicalEpgBindings)
          .where(eq(canonicalEpgBindings.xmltvSourceId, sourceId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(scheduledJobConfigs)
          .where(
            and(
              eq(scheduledJobConfigs.scopeType, "source"),
              eq(scheduledJobConfigs.scopeId, sourceId),
            ),
          ),
      ]);

    return {
      sourceId,
      sourceName: target.sourceName,
      sourceType: target.sourceType,
      sourceVersion: target.sourceVersion,
      counts: {
        rawChannels: Number(rawChannelsForSource[0]?.count ?? 0),
        channels: 0,
        programmes: Number(programmesForSource[0]?.count ?? 0),
        epgMappings: Number(epgMappings[0]?.count ?? 0),
        canonicalMemberships: 0,
        streams: 0,
        schedules: Number(schedules[0]?.count ?? 0),
      },
    };
  }

  async applySourceDelete(
    sourceId: string,
    recovery?: { recoveryPointId: string; changeSetId: string },
    expectedSourceVersion?: number,
  ): Promise<SourceDeleteResult> {
    const impact = await this.prepareSourceDelete(sourceId);
    if (
      expectedSourceVersion !== undefined &&
      impact.sourceVersion !== expectedSourceVersion
    ) {
      throw new Error(
        `Stale source version: expected ${expectedSourceVersion}, current ${impact.sourceVersion ?? 1}`,
      );
    }

    await db.transaction(async (tx) => {
      const sourceTable =
        impact.sourceType === "m3u" ? m3uSources : xmltvSources;
      const [currentSource] = await tx
        .select({ version: sourceTable.version })
        .from(sourceTable)
        .where(eq(sourceTable.id, sourceId))
        .limit(1);
      if (
        !currentSource ||
        (expectedSourceVersion !== undefined &&
          (currentSource.version ?? 1) !== expectedSourceVersion)
      ) {
        throw new Error(
          `Stale source version: expected ${expectedSourceVersion ?? impact.sourceVersion ?? 1}, current ${currentSource?.version ?? "missing"}`,
        );
      }
      if (recovery) {
        await this.captureRecoveryState(
          tx,
          sourceId,
          recovery.changeSetId,
          recovery.recoveryPointId,
        );
      }
      await tx
        .delete(scheduledJobConfigs)
        .where(
          and(
            eq(scheduledJobConfigs.scopeType, "source"),
            eq(scheduledJobConfigs.scopeId, sourceId),
          ),
        );

      if (impact.sourceType === "m3u") {
        const sourceRawChannels = await tx
          .select({ id: rawM3uChannels.id })
          .from(rawM3uChannels)
          .where(eq(rawM3uChannels.sourceId, sourceId));
        const sourceRawChannelIds = sourceRawChannels.map(
          (channel) => channel.id,
        );
        const sourceChannels = await tx
          .select({ id: channels.id })
          .from(channels)
          .leftJoin(
            rawM3uChannels,
            eq(channels.rawChannelId, rawM3uChannels.id),
          )
          .where(
            or(
              eq(channels.m3uSourceId, sourceId),
              eq(rawM3uChannels.sourceId, sourceId),
            ),
          );
        const sourceChannelIds = sourceChannels.map((channel) => channel.id);

        // Remove source-derived output and memberships before deleting the
        // source-channel rows. Canonical channels themselves remain durable so
        // manual streams and operator lifecycle decisions are not destroyed.
        const streamWhere =
          sourceChannelIds.length > 0
            ? or(
                eq(channelStreams.m3uSourceId, sourceId),
                inArray(channelStreams.sourceChannelId, sourceChannelIds),
                ...(sourceRawChannelIds.length > 0
                  ? [inArray(channelStreams.rawChannelId, sourceRawChannelIds)]
                  : []),
              )
            : sourceRawChannelIds.length > 0
              ? or(
                  eq(channelStreams.m3uSourceId, sourceId),
                  inArray(channelStreams.rawChannelId, sourceRawChannelIds),
                )
              : eq(channelStreams.m3uSourceId, sourceId);
        const affectedCanonicalRows = await tx
          .select({ canonicalChannelId: channelStreams.canonicalChannelId })
          .from(channelStreams)
          .where(streamWhere);
        const affectedCanonicalIds = [
          ...new Set(
            affectedCanonicalRows.map((row) => row.canonicalChannelId),
          ),
        ];
        await tx.delete(channelStreams).where(streamWhere);

        // Deleting a source line may remove a canonical channel's primary
        // stream. Repair both sides of the primary invariant while the same
        // transaction still owns the deletion.
        for (const canonicalChannelId of affectedCanonicalIds) {
          const remaining = await tx
            .select({
              id: channelStreams.id,
              isPrimary: channelStreams.isPrimary,
              position: channelStreams.position,
              createdAt: channelStreams.createdAt,
            })
            .from(channelStreams)
            .where(eq(channelStreams.canonicalChannelId, canonicalChannelId));
          remaining.sort(
            (a, b) =>
              (a.position ?? Number.MAX_SAFE_INTEGER) -
                (b.position ?? Number.MAX_SAFE_INTEGER) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          );
          const primary =
            remaining.find((stream) => stream.isPrimary) ?? remaining[0];
          for (const stream of remaining) {
            const shouldBePrimary = stream.id === primary?.id;
            if (stream.isPrimary !== shouldBePrimary) {
              await tx
                .update(channelStreams)
                .set({
                  isPrimary: shouldBePrimary,
                  version: sql`${channelStreams.version} + 1`,
                  updatedAt: new Date(),
                })
                .where(eq(channelStreams.id, stream.id));
            }
          }
          await tx
            .update(canonicalChannels)
            .set({
              primaryStreamId: primary?.id ?? null,
              updatedAt: new Date(),
              version: sql`${canonicalChannels.version} + 1`,
            })
            .where(eq(canonicalChannels.id, canonicalChannelId));
        }

        if (sourceChannelIds.length > 0) {
          await tx
            .delete(canonicalChannelMembers)
            .where(
              inArray(
                canonicalChannelMembers.sourceChannelId,
                sourceChannelIds,
              ),
            );
          await tx
            .delete(channelOverrides)
            .where(inArray(channelOverrides.channelId, sourceChannelIds));
          await tx
            .delete(channels)
            .where(inArray(channels.id, sourceChannelIds));
        }
        await tx
          .delete(sourceChannelIdentityAliases)
          .where(eq(sourceChannelIdentityAliases.sourceId, sourceId));

        const deletedSources = await tx
          .delete(m3uSources)
          .where(eq(m3uSources.id, sourceId))
          .returning({ id: m3uSources.id });
        if (deletedSources.length === 0) {
          throw new Error("Source changed before deletion");
        }
        return;
      }

      // XMLTV bindings use RESTRICT on the source FK, so clear them before
      // deleting programmes and the source row.
      await tx
        .delete(canonicalEpgBindings)
        .where(eq(canonicalEpgBindings.xmltvSourceId, sourceId));
      await tx.delete(programmes).where(eq(programmes.sourceId, sourceId));
      const deletedSources = await tx
        .delete(xmltvSources)
        .where(eq(xmltvSources.id, sourceId))
        .returning({ id: xmltvSources.id });
      if (deletedSources.length === 0) {
        throw new Error("Source changed before deletion");
      }
    });

    return { ...impact, deleted: true };
  }
}
