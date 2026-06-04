import { Inject, Injectable } from "@nestjs/common";
import { EpgMatcher } from "@/domain/epg-matching/epg-matcher";
import type { IChannelRepository } from "@/domain/channel-catalog";
import type { IRawXmltvChannelRepository } from "@/domain/channel-catalog";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";

@Injectable()
export class MatchEpgUseCase {
  constructor(
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
    @Inject("RAW_XMLTV_CHANNEL_REPOSITORY")
    private readonly xmltvChannelRepo: IRawXmltvChannelRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
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

    // Regenerate canonical_channels from all channels
    await this.canonicalRepo.deleteAll();

    const allChannels = await this.channelRepo.findAll({ page: 1, pageSize: 10000 });
    if (allChannels.items.length > 0) {
      const canonicalData = allChannels.items.map((ch) => ({
        standardName: ch.displayName,
        standardGroup: ch.groupTitle,
        standardLogo: ch.tvgLogo,
        channelNumber: null,
        hidden: false,
        starred: false,
        disabled: false,
        epgChannelId: ch.epgChannelId,
        epgMatchType: ch.epgMatchType,
        epgStatus: ch.epgChannelId ? "matched_auto" as const : null,
        outputStatus: "active" as const,
        qualityScore: null,
        primaryStreamId: null,
        mergedFromIds: ch.id,
        mergeMethod: null,
        conflictNote: null,
        lastMergedAt: new Date(),
      }));
      await this.canonicalRepo.createBatch(canonicalData);
    }

    return { matched, unmatched, conflicts };
  }
}
