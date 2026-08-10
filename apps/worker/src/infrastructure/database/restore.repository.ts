/**
 * Drizzle adapter for IRestorePort (008-pipeline-reliability T008).
 *
 * Restores captured objects by upserting them back to their original tables.
 * The entityType field determines the target table via a dispatch map.
 */
import { db } from "../../db";
import {
  channels,
  canonicalChannels,
  channelStreams,
  canonicalChannelMembers,
  m3uSources,
  rawM3uChannels,
  channelOverrides,
  scheduledJobConfigs,
  sourceChannelIdentityAliases,
  xmltvSources,
  rawXmltvChannels,
  programmes,
  canonicalEpgBindings,
} from "../../schema";
import type {
  IRestorePort,
  RestoreItem,
} from "@/application/operation-safety/apply-recovery-restore.use-case";

type RestoreExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  return value instanceof Date ? value : new Date(String(value));
}

export class DrizzleRestoreRepository implements IRestorePort {
  async restoreObject(item: RestoreItem): Promise<void> {
    await this.restoreObjectWith(item, db);
  }

  async restoreObjects(items: readonly RestoreItem[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of items) {
        await this.restoreObjectWith(item, tx);
      }
    });
  }

  private async restoreObjectWith(
    item: RestoreItem,
    executor: RestoreExecutor,
  ): Promise<void> {
    const payload = item.payload;
    switch (item.entityType) {
      case "m3u_source":
        await executor
          .insert(m3uSources)
          .values({
            id: item.entityId,
            name: payload.name as string,
            url: payload.url as string,
            headers: (payload.headers as Record<string, string> | null) ?? null,
            enabled: (payload.enabled as boolean) ?? true,
            role: (payload.role as string) ?? "primary",
            priority: (payload.priority as number) ?? 100,
            participateInOutput:
              (payload.participateInOutput as boolean) ?? true,
            allowFallback: (payload.allowFallback as boolean) ?? true,
            failureCount: (payload.failureCount as number) ?? 0,
            lastSuccessAt: asDate(payload.lastSuccessAt),
            qualityScore: payload.qualityScore as number | null,
            lastSyncAt: asDate(payload.lastSyncAt),
            lastSyncStatus: payload.lastSyncStatus as string | null,
            lastCheckAt: asDate(payload.lastCheckAt),
            checkStatus: payload.checkStatus as string | null,
            checkResponseTime: payload.checkResponseTime as number | null,
            checkError: payload.checkError as string | null,
            freshnessThresholdMinutes:
              (payload.freshnessThresholdMinutes as number) ?? 1440,
            lastContentFingerprint: payload.lastContentFingerprint as
              | string
              | null,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: m3uSources.id,
            set: {
              name: payload.name as string,
              url: payload.url as string,
              headers:
                (payload.headers as Record<string, string> | null) ?? null,
              enabled: (payload.enabled as boolean) ?? true,
              role: (payload.role as string) ?? "primary",
              priority: (payload.priority as number) ?? 100,
              participateInOutput:
                (payload.participateInOutput as boolean) ?? true,
              allowFallback: (payload.allowFallback as boolean) ?? true,
              failureCount: (payload.failureCount as number) ?? 0,
              lastSuccessAt: asDate(payload.lastSuccessAt),
              qualityScore: payload.qualityScore as number | null,
              lastSyncAt: asDate(payload.lastSyncAt),
              lastSyncStatus: payload.lastSyncStatus as string | null,
              lastCheckAt: asDate(payload.lastCheckAt),
              checkStatus: payload.checkStatus as string | null,
              checkResponseTime: payload.checkResponseTime as number | null,
              checkError: payload.checkError as string | null,
              freshnessThresholdMinutes:
                (payload.freshnessThresholdMinutes as number) ?? 1440,
              lastContentFingerprint: payload.lastContentFingerprint as
                | string
                | null,
              version: item.entityVersion,
              updatedAt: new Date(),
            },
          });
        break;

      case "xmltv_source":
        await executor
          .insert(xmltvSources)
          .values({
            id: item.entityId,
            name: payload.name as string,
            url: payload.url as string,
            headers: (payload.headers as Record<string, string> | null) ?? null,
            enabled: (payload.enabled as boolean) ?? true,
            role: (payload.role as string) ?? "primary",
            priority: (payload.priority as number) ?? 100,
            participateInOutput:
              (payload.participateInOutput as boolean) ?? true,
            failureCount: (payload.failureCount as number) ?? 0,
            lastSuccessAt: asDate(payload.lastSuccessAt),
            qualityScore: payload.qualityScore as number | null,
            lastSyncAt: asDate(payload.lastSyncAt),
            lastSyncStatus: payload.lastSyncStatus as string | null,
            lastCheckAt: asDate(payload.lastCheckAt),
            checkStatus: payload.checkStatus as string | null,
            checkResponseTime: payload.checkResponseTime as number | null,
            checkError: payload.checkError as string | null,
            freshnessThresholdMinutes:
              (payload.freshnessThresholdMinutes as number) ?? 1440,
            lastContentFingerprint: payload.lastContentFingerprint as
              | string
              | null,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: xmltvSources.id,
            set: {
              name: payload.name as string,
              url: payload.url as string,
              headers:
                (payload.headers as Record<string, string> | null) ?? null,
              enabled: (payload.enabled as boolean) ?? true,
              role: (payload.role as string) ?? "primary",
              priority: (payload.priority as number) ?? 100,
              participateInOutput:
                (payload.participateInOutput as boolean) ?? true,
              failureCount: (payload.failureCount as number) ?? 0,
              lastSuccessAt: asDate(payload.lastSuccessAt),
              qualityScore: payload.qualityScore as number | null,
              lastSyncAt: asDate(payload.lastSyncAt),
              lastSyncStatus: payload.lastSyncStatus as string | null,
              lastCheckAt: asDate(payload.lastCheckAt),
              checkStatus: payload.checkStatus as string | null,
              checkResponseTime: payload.checkResponseTime as number | null,
              checkError: payload.checkError as string | null,
              freshnessThresholdMinutes:
                (payload.freshnessThresholdMinutes as number) ?? 1440,
              lastContentFingerprint: payload.lastContentFingerprint as
                | string
                | null,
              version: item.entityVersion,
              updatedAt: new Date(),
            },
          });
        break;

      case "raw_xmltv_channel":
        await executor
          .insert(rawXmltvChannels)
          .values({
            id: item.entityId,
            sourceId: payload.sourceId as string,
            xmltvId: payload.xmltvId as string,
            displayName: payload.displayName as string | null,
            icon: payload.icon as string | null,
            syncedAt: asDate(payload.syncedAt) ?? new Date(),
            createdAt: asDate(payload.createdAt) ?? new Date(),
            updatedAt: asDate(payload.updatedAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: rawXmltvChannels.id,
            set: {
              sourceId: payload.sourceId as string,
              xmltvId: payload.xmltvId as string,
              displayName: payload.displayName as string | null,
              icon: payload.icon as string | null,
              syncedAt: asDate(payload.syncedAt) ?? new Date(),
              updatedAt: new Date(),
            },
          });
        break;

      case "programme":
        await executor
          .insert(programmes)
          .values({
            id: item.entityId,
            sourceId: payload.sourceId as string,
            xmltvChannelId: payload.xmltvChannelId as string,
            title: payload.title as string | null,
            subTitle: payload.subTitle as string | null,
            desc: payload.desc as string | null,
            category: payload.category as string | null,
            startAt: asDate(payload.startAt) ?? new Date(),
            stopAt: asDate(payload.stopAt) ?? new Date(),
            createdAt: asDate(payload.createdAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: programmes.id,
            set: {
              sourceId: payload.sourceId as string,
              xmltvChannelId: payload.xmltvChannelId as string,
              title: payload.title as string | null,
              subTitle: payload.subTitle as string | null,
              desc: payload.desc as string | null,
              category: payload.category as string | null,
              startAt: asDate(payload.startAt) ?? new Date(),
              stopAt: asDate(payload.stopAt) ?? new Date(),
            },
          });
        break;

      case "canonical_epg_binding":
        await executor
          .insert(canonicalEpgBindings)
          .values({
            canonicalChannelId: item.entityId,
            xmltvSourceId: payload.xmltvSourceId as string | null,
            xmltvChannelId: payload.xmltvChannelId as string | null,
            status: (payload.status as string) ?? "unmatched",
            matchType: payload.matchType as string | null,
            locked: (payload.locked as boolean) ?? false,
            decisionReason: payload.decisionReason as string | null,
            version: item.entityVersion,
            createdAt: asDate(payload.createdAt) ?? new Date(),
            updatedAt: asDate(payload.updatedAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: canonicalEpgBindings.canonicalChannelId,
            set: {
              xmltvSourceId: payload.xmltvSourceId as string | null,
              xmltvChannelId: payload.xmltvChannelId as string | null,
              status: (payload.status as string) ?? "unmatched",
              matchType: payload.matchType as string | null,
              locked: (payload.locked as boolean) ?? false,
              decisionReason: payload.decisionReason as string | null,
              version: item.entityVersion,
              updatedAt: new Date(),
            },
          });
        break;

      case "raw_m3u_channel":
        await executor
          .insert(rawM3uChannels)
          .values({
            id: item.entityId,
            sourceId: payload.sourceId as string,
            tvgId: payload.tvgId as string | null,
            tvgName: payload.tvgName as string | null,
            tvgLogo: payload.tvgLogo as string | null,
            groupTitle: payload.groupTitle as string | null,
            displayName: payload.displayName as string,
            streamUrl: payload.streamUrl as string,
            channelIdentity: payload.channelIdentity as string,
            syncedAt: asDate(payload.syncedAt) ?? new Date(),
            disappeared: (payload.disappeared as boolean) ?? false,
            sourcePresence: (payload.sourcePresence as string) ?? "present",
            missingSince: asDate(payload.missingSince),
            purgedAt: asDate(payload.purgedAt),
            createdAt: asDate(payload.createdAt) ?? new Date(),
            updatedAt: asDate(payload.updatedAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: rawM3uChannels.id,
            set: {
              sourceId: payload.sourceId as string,
              tvgId: payload.tvgId as string | null,
              tvgName: payload.tvgName as string | null,
              tvgLogo: payload.tvgLogo as string | null,
              groupTitle: payload.groupTitle as string | null,
              displayName: payload.displayName as string,
              streamUrl: payload.streamUrl as string,
              channelIdentity: payload.channelIdentity as string,
              syncedAt: asDate(payload.syncedAt) ?? new Date(),
              disappeared: (payload.disappeared as boolean) ?? false,
              sourcePresence: (payload.sourcePresence as string) ?? "present",
              missingSince: asDate(payload.missingSince),
              purgedAt: asDate(payload.purgedAt),
              updatedAt: new Date(),
            },
          });
        break;

      case "channel":
        await executor
          .insert(channels)
          .values({
            id: item.entityId,
            channelIdentity: payload.channelIdentity as string,
            m3uSourceId: payload.m3uSourceId as string | null,
            displayName: payload.displayName as string,
            groupTitle: payload.groupTitle as string | null,
            tvgId: payload.tvgId as string | null,
            tvgLogo: payload.tvgLogo as string | null,
            streamUrl: payload.streamUrl as string | null,
            sourcePresence: (payload.sourcePresence as string) ?? "present",
            rawChannelId: payload.rawChannelId as string | null,
            epgChannelId: payload.epgChannelId as string | null,
            epgMatchType: payload.epgMatchType as string | null,
            active: (payload.active as boolean) ?? true,
            streamStatus: payload.streamStatus as string | null,
            streamResponseTime: payload.streamResponseTime as number | null,
            streamCheckedAt: asDate(payload.streamCheckedAt),
            streamError: payload.streamError as string | null,
            firstSeenAt: asDate(payload.firstSeenAt),
            lastSeenAt: asDate(payload.lastSeenAt),
            missingSince: asDate(payload.missingSince),
            sourceRevision: payload.sourceRevision as string | null,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: channels.id,
            set: {
              m3uSourceId: payload.m3uSourceId as string | null,
              displayName: payload.displayName as string,
              groupTitle: payload.groupTitle as string | null,
              tvgId: payload.tvgId as string | null,
              tvgLogo: payload.tvgLogo as string | null,
              streamUrl: payload.streamUrl as string | null,
              sourcePresence: (payload.sourcePresence as string) ?? "present",
              rawChannelId: payload.rawChannelId as string | null,
              epgChannelId: payload.epgChannelId as string | null,
              epgMatchType: payload.epgMatchType as string | null,
              active: (payload.active as boolean) ?? true,
              streamStatus: payload.streamStatus as string | null,
              streamResponseTime: payload.streamResponseTime as number | null,
              streamCheckedAt: asDate(payload.streamCheckedAt),
              streamError: payload.streamError as string | null,
              firstSeenAt: asDate(payload.firstSeenAt),
              lastSeenAt: asDate(payload.lastSeenAt),
              missingSince: asDate(payload.missingSince),
              sourceRevision: payload.sourceRevision as string | null,
              version: item.entityVersion,
            },
          });
        break;

      case "channel_override":
        await executor
          .insert(channelOverrides)
          .values({
            id: item.entityId,
            channelId: payload.channelId as string,
            customName: payload.customName as string | null,
            customGroup: payload.customGroup as string | null,
            customLogo: payload.customLogo as string | null,
            channelNumber: payload.channelNumber as number | null,
            hidden: (payload.hidden as boolean) ?? false,
            starred: (payload.starred as boolean) ?? false,
            manualEpgChannelId: payload.manualEpgChannelId as string | null,
            manualEpgLocked: (payload.manualEpgLocked as boolean) ?? false,
            manualEpgSourceId: payload.manualEpgSourceId as string | null,
            decisionReason: payload.decisionReason as string | null,
            version: item.entityVersion,
            createdAt: asDate(payload.createdAt) ?? new Date(),
            updatedAt: asDate(payload.updatedAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: channelOverrides.channelId,
            set: {
              customName: payload.customName as string | null,
              customGroup: payload.customGroup as string | null,
              customLogo: payload.customLogo as string | null,
              channelNumber: payload.channelNumber as number | null,
              hidden: (payload.hidden as boolean) ?? false,
              starred: (payload.starred as boolean) ?? false,
              manualEpgChannelId: payload.manualEpgChannelId as string | null,
              manualEpgLocked: (payload.manualEpgLocked as boolean) ?? false,
              manualEpgSourceId: payload.manualEpgSourceId as string | null,
              decisionReason: payload.decisionReason as string | null,
              version: item.entityVersion,
              updatedAt: new Date(),
            },
          });
        break;

      case "canonical_channel":
        await executor
          .insert(canonicalChannels)
          .values({
            id: item.entityId,
            standardName: payload.standardName as string,
            standardGroup: payload.standardGroup as string | null,
            standardLogo: payload.standardLogo as string | null,
            channelNumber: payload.channelNumber as number | null,
            hidden: (payload.hidden as boolean) ?? false,
            starred: (payload.starred as boolean) ?? false,
            outputStatus: (payload.outputStatus as string) ?? "active",
            lifecycle: (payload.lifecycle as string) ?? "active",
            disabled: (payload.disabled as boolean) ?? false,
            epgChannelId: payload.epgChannelId as string | null,
            epgMatchType: payload.epgMatchType as string | null,
            epgStatus: payload.epgStatus as string | null,
            qualityScore: payload.qualityScore as number | null,
            primaryStreamId: payload.primaryStreamId as string | null,
            mergedFromIds: payload.mergedFromIds as string | null,
            mergeMethod: payload.mergeMethod as string | null,
            conflictNote: payload.conflictNote as string | null,
            lastMergedAt: asDate(payload.lastMergedAt),
            lifecycleReason: payload.lifecycleReason as string | null,
            trashedAt: asDate(payload.trashedAt),
            purgeAfter: asDate(payload.purgeAfter),
            stableKey: payload.stableKey as string | null,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: canonicalChannels.id,
            set: {
              standardName: payload.standardName as string,
              standardGroup: payload.standardGroup as string | null,
              standardLogo: payload.standardLogo as string | null,
              channelNumber: payload.channelNumber as number | null,
              hidden: (payload.hidden as boolean) ?? false,
              starred: (payload.starred as boolean) ?? false,
              outputStatus: (payload.outputStatus as string) ?? "active",
              lifecycle: (payload.lifecycle as string) ?? "active",
              epgChannelId: payload.epgChannelId as string | null,
              epgMatchType: payload.epgMatchType as string | null,
              epgStatus: payload.epgStatus as string | null,
              qualityScore: payload.qualityScore as number | null,
              primaryStreamId: payload.primaryStreamId as string | null,
              mergedFromIds: payload.mergedFromIds as string | null,
              mergeMethod: payload.mergeMethod as string | null,
              conflictNote: payload.conflictNote as string | null,
              lastMergedAt: asDate(payload.lastMergedAt),
              lifecycleReason: payload.lifecycleReason as string | null,
              trashedAt: asDate(payload.trashedAt),
              purgeAfter: asDate(payload.purgeAfter),
              stableKey: payload.stableKey as string | null,
              disabled: (payload.disabled as boolean) ?? false,
              version: item.entityVersion,
            },
          });
        break;

      case "channel_stream":
        await executor
          .insert(channelStreams)
          .values({
            id: item.entityId,
            canonicalChannelId: payload.canonicalChannelId as string,
            m3uSourceId: payload.m3uSourceId as string | null,
            rawChannelId: payload.rawChannelId as string | null,
            sourceChannelId: payload.sourceChannelId as string | null,
            streamUrl: payload.streamUrl as string,
            isPrimary: (payload.isPrimary as boolean) ?? false,
            healthStatus: (payload.healthStatus as string) ?? "unknown",
            responseTime: payload.responseTime as number | null,
            lastCheckedAt: asDate(payload.lastCheckedAt),
            lastSuccessAt: asDate(payload.lastSuccessAt),
            lastPlaybackReportAt: asDate(payload.lastPlaybackReportAt),
            consecutiveFailures: (payload.consecutiveFailures as number) ?? 0,
            successRate: payload.successRate as number | null,
            streamError: payload.streamError as string | null,
            streamCodec: payload.streamCodec as string | null,
            streamFormat: payload.streamFormat as string | null,
            streamWidth: payload.streamWidth as number | null,
            streamHeight: payload.streamHeight as number | null,
            streamFrameRate: payload.streamFrameRate as number | null,
            streamBitrate: payload.streamBitrate as number | null,
            origin: (payload.origin as string) ?? "source",
            position: payload.position as number | null,
            eligibleForFailover:
              (payload.eligibleForFailover as boolean) ?? true,
            missingSince: asDate(payload.missingSince),
            purgedAt: asDate(payload.purgedAt),
            consecutiveSuccesses: (payload.consecutiveSuccesses as number) ?? 0,
            failingSince: asDate(payload.failingSince),
            cooldownUntil: asDate(payload.cooldownUntil),
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: channelStreams.id,
            set: {
              canonicalChannelId: payload.canonicalChannelId as string,
              m3uSourceId: payload.m3uSourceId as string | null,
              rawChannelId: payload.rawChannelId as string | null,
              sourceChannelId: payload.sourceChannelId as string | null,
              streamUrl: payload.streamUrl as string,
              isPrimary: (payload.isPrimary as boolean) ?? false,
              healthStatus: (payload.healthStatus as string) ?? "unknown",
              responseTime: payload.responseTime as number | null,
              lastCheckedAt: asDate(payload.lastCheckedAt),
              lastSuccessAt: asDate(payload.lastSuccessAt),
              lastPlaybackReportAt: asDate(payload.lastPlaybackReportAt),
              consecutiveFailures: (payload.consecutiveFailures as number) ?? 0,
              successRate: payload.successRate as number | null,
              streamError: payload.streamError as string | null,
              streamCodec: payload.streamCodec as string | null,
              streamFormat: payload.streamFormat as string | null,
              streamWidth: payload.streamWidth as number | null,
              streamHeight: payload.streamHeight as number | null,
              streamFrameRate: payload.streamFrameRate as number | null,
              streamBitrate: payload.streamBitrate as number | null,
              missingSince: asDate(payload.missingSince),
              purgedAt: asDate(payload.purgedAt),
              origin: (payload.origin as string) ?? "source",
              position: payload.position as number | null,
              eligibleForFailover:
                (payload.eligibleForFailover as boolean) ?? true,
              consecutiveSuccesses:
                (payload.consecutiveSuccesses as number) ?? 0,
              failingSince: asDate(payload.failingSince),
              cooldownUntil: asDate(payload.cooldownUntil),
              version: item.entityVersion,
            },
          });
        break;

      case "canonical_channel_member":
        await executor
          .insert(canonicalChannelMembers)
          .values({
            id: item.entityId,
            canonicalChannelId: payload.canonicalChannelId as string,
            sourceChannelId: payload.sourceChannelId as string,
            channelIdentity: payload.channelIdentity as string,
            membershipSource:
              (payload.membershipSource as string) ?? "automatic",
            active: (payload.active as boolean) ?? true,
            joinedAt: asDate(payload.joinedAt) ?? new Date(),
            leftAt: asDate(payload.leftAt),
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: [
              canonicalChannelMembers.canonicalChannelId,
              canonicalChannelMembers.sourceChannelId,
            ],
            set: {
              channelIdentity: payload.channelIdentity as string,
              membershipSource:
                (payload.membershipSource as string) ?? "automatic",
              active: (payload.active as boolean) ?? true,
              joinedAt: asDate(payload.joinedAt) ?? new Date(),
              leftAt: asDate(payload.leftAt),
              version: item.entityVersion,
            },
          });
        break;

      case "scheduled_job_config":
        await executor
          .insert(scheduledJobConfigs)
          .values({
            id: item.entityId,
            name: payload.name as string,
            description: payload.description as string | null,
            taskType: payload.taskType as string,
            scopeType: payload.scopeType as string | null,
            scopeId: payload.scopeId as string | null,
            enabled: (payload.enabled as boolean) ?? true,
            intervalMs: payload.intervalMs as number | null,
            cronExpression: payload.cronExpression as string | null,
            timeZone: payload.timeZone as string,
            overlapPolicy: (payload.overlapPolicy as string) ?? "skip",
            nextRunAt: asDate(payload.nextRunAt),
            lastRunAt: asDate(payload.lastRunAt),
            lastStatus: payload.lastStatus as string | null,
            lastSkipReason: payload.lastSkipReason as string | null,
            version: item.entityVersion,
            createdAt: asDate(payload.createdAt) ?? new Date(),
            updatedAt: asDate(payload.updatedAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: scheduledJobConfigs.id,
            set: {
              name: payload.name as string,
              description: payload.description as string | null,
              taskType: payload.taskType as string,
              scopeType: payload.scopeType as string | null,
              scopeId: payload.scopeId as string | null,
              enabled: (payload.enabled as boolean) ?? true,
              intervalMs: payload.intervalMs as number | null,
              cronExpression: payload.cronExpression as string | null,
              timeZone: payload.timeZone as string,
              overlapPolicy: (payload.overlapPolicy as string) ?? "skip",
              nextRunAt: asDate(payload.nextRunAt),
              lastRunAt: asDate(payload.lastRunAt),
              lastStatus: payload.lastStatus as string | null,
              lastSkipReason: payload.lastSkipReason as string | null,
              version: item.entityVersion,
              updatedAt: new Date(),
            },
          });
        break;

      case "source_channel_identity_alias":
        await executor
          .insert(sourceChannelIdentityAliases)
          .values({
            id: item.entityId,
            sourceId: payload.sourceId as string,
            alias: payload.alias as string,
            aliasType: payload.aliasType as string,
            sourceChannelId: payload.sourceChannelId as string,
            active: (payload.active as boolean) ?? true,
            createdAt: asDate(payload.createdAt) ?? new Date(),
          })
          .onConflictDoUpdate({
            target: sourceChannelIdentityAliases.id,
            set: {
              sourceId: payload.sourceId as string,
              alias: payload.alias as string,
              aliasType: payload.aliasType as string,
              sourceChannelId: payload.sourceChannelId as string,
              active: (payload.active as boolean) ?? true,
            },
          });
        break;

      default:
        // Unknown entity types are silently skipped — the restore is best-effort
        // and must not crash on forward-compatible payload formats.
        break;
    }
  }
}
