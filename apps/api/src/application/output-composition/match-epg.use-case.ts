import { Inject, Injectable } from "@nestjs/common";
import { EpgMatcher } from "@/domain/epg-matching/epg-matcher";
import type { IChannelRepository } from "@/domain/channel-catalog";
import type { IRawXmltvChannelRepository } from "@/domain/channel-catalog";
import type { ICanonicalChannelRepository, IChannelStreamRepository } from "@/domain/output-composition";
import { computeMergeKey } from "@magi/backend-core";

@Injectable()
export class MatchEpgUseCase {
  constructor(
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
    @Inject("RAW_XMLTV_CHANNEL_REPOSITORY")
    private readonly xmltvChannelRepo: IRawXmltvChannelRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(sourceId: string): Promise<{ matched: number; unmatched: number; conflicts: number }> {
    const xmltvChannels = await this.xmltvChannelRepo.findBySourceId(sourceId);
    const xmltvList = xmltvChannels.map((c) => ({ id: c.xmltvId, displayName: c.displayName }));

    const { items: channels } = await this.channelRepo.findAll({ page: 1, pageSize: 50000 });
    const matcher = new EpgMatcher();
    let matched = 0;
    let unmatched = 0;
    let conflicts = 0;

    for (const channel of channels) {
      const result = matcher.match({
        channelTvgId: channel.tvgId,
        channelTvgName: null,
        channelDisplayName: channel.displayName,
        manualEpgChannelId: null,
        xmltvChannels: xmltvList,
      });

      if (result.matched && result.xmltvChannelId) {
        await this.channelRepo.update(channel.id, {
          epgChannelId: result.xmltvChannelId,
          epgMatchType: result.matchType,
        });
        matched++;
      } else if (result.matchType === "conflict") {
        conflicts++;
      } else {
        unmatched++;
      }
    }

    // Regenerate canonical_channels from all channels, grouped by merge key
    await this.canonicalRepo.deleteAll();

    const allChannels = await this.channelRepo.findAll({ page: 1, pageSize: 50000 });
    if (allChannels.items.length > 0) {
      // Group channels by merge key
      const channelsByMergeKey = new Map<string, typeof allChannels.items>();
      for (const ch of allChannels.items) {
        const key = computeMergeKey({ tvgId: ch.tvgId, displayName: ch.displayName, groupTitle: ch.groupTitle });
        const arr = channelsByMergeKey.get(key) ?? [];
        arr.push(ch);
        channelsByMergeKey.set(key, arr);
      }

      const canonicalData: Parameters<typeof this.canonicalRepo.createBatch>[0] = [];
      const allStreamData: Parameters<typeof this.streamRepo.createBatch>[0] = [];

      for (const [, group] of channelsByMergeKey) {
        const best = group[0]!;

        // Collect best EPG info from group
        let epgChannelId: string | null = null;
        let epgMatchType: string | null = null;
        for (const ch of group) {
          if (ch.epgChannelId && !epgChannelId) {
            epgChannelId = ch.epgChannelId;
            epgMatchType = ch.epgMatchType;
          }
        }

        const mergedIds = JSON.stringify(group.map((g) => g.channelIdentity));

        canonicalData.push({
          standardName: best.displayName,
          standardGroup: best.groupTitle,
          standardLogo: best.tvgLogo,
          channelNumber: null,
          // New canonical channels default to hidden — operators opt-in per channel.
          hidden: true,
          lifecycle: "hidden",
          starred: false,
          disabled: false,
          epgChannelId,
          epgMatchType,
          epgStatus: epgChannelId ? "matched_auto" as const : null,
          outputStatus: "active" as const,
          qualityScore: null,
          primaryStreamId: null,
          mergedFromIds: mergedIds,
          mergeMethod: group.length > 1 ? "merge_key" : null,
          conflictNote: null,
          lastMergedAt: new Date(),
        });

        // Create streams for all channels in the group
        let hasPrimary = false;
        for (const ch of group) {
          if (!ch.streamUrl) continue;
          allStreamData.push({
            canonicalChannelId: "", // Will be set after canonical batch insert
            m3uSourceId: ch.m3uSourceId,
            rawChannelId: ch.rawChannelId,
            sourceChannelId: ch.id,
            streamUrl: ch.streamUrl,
            isPrimary: !hasPrimary,
            healthStatus: "unknown",
            responseTime: null,
            lastCheckedAt: null,
            lastSuccessAt: null,
            consecutiveFailures: 0,
            successRate: null,
            streamError: null,
    streamCodec: null,
    streamFormat: null,
    streamWidth: null,
    streamHeight: null,
    streamFrameRate: null,
    streamBitrate: null,
          });
          if (!hasPrimary) hasPrimary = true;
        }
      }

      const createdCanonicals = await this.canonicalRepo.createBatch(canonicalData);

      // Map canonical IDs to stream data using merge key
      // Since createBatch returns in order, match by index
      const mergeKeys = [...channelsByMergeKey.keys()];
      for (let i = 0; i < createdCanonicals.length; i++) {
        const key = mergeKeys[i]!;
        const group = channelsByMergeKey.get(key)!;
        const canonicalId = createdCanonicals[i]!.id;

        // Update streams for this group
        for (const ch of group) {
          if (!ch.streamUrl) continue;
          const streamIdx = allStreamData.findIndex(
            (s) => s.sourceChannelId === ch.id && s.canonicalChannelId === "",
          );
          if (streamIdx !== -1) {
            allStreamData[streamIdx]!.canonicalChannelId = canonicalId;
          }
        }
      }

      // Filter out streams that couldn't be matched
      const validStreams = allStreamData.filter((s) => s.canonicalChannelId !== "");
      if (validStreams.length > 0) {
        const createdStreams = await this.streamRepo.createBatch(validStreams);

        // Backfill primaryStreamId on each canonical
        for (const canon of createdCanonicals) {
          const primary = createdStreams.find(
            (s) => s.canonicalChannelId === canon.id && s.isPrimary,
          );
          if (primary) {
            await this.canonicalRepo.update(canon.id, { primaryStreamId: primary.id });
          }
        }
      }
    }

    return { matched, unmatched, conflicts };
  }
}
