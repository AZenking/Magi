import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ICanonicalChannelRepository, IChannelStreamRepository, IStreamEnrichmentService, CanonicalChannel, ChannelStream } from "@/domain/output-composition";

export interface EnrichedStream extends ChannelStream {
  m3uSourceName: string | null;
  sourceChannelName: string | null;
}

export interface OutputChannelDetail {
  channel: CanonicalChannel;
  streams: EnrichedStream[];
}

@Injectable()
export class FindOutputChannelDetailUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("STREAM_ENRICHMENT_SERVICE")
    private readonly enrichment: IStreamEnrichmentService,
  ) {}

  async execute(id: string): Promise<OutputChannelDetail> {
    const channel = await this.canonicalRepo.findById(id);
    if (!channel) throw new NotFoundException("Channel not found");

    const streams = await this.streamRepo.findByCanonicalChannelId(id);

    const sourceIds = [...new Set(streams.map((s) => s.m3uSourceId).filter(Boolean))] as string[];
    const channelIds = [...new Set(streams.map((s) => s.sourceChannelId).filter(Boolean))] as string[];

    const [sourceNames, channelNames] = await Promise.all([
      this.enrichment.getSourceNames(sourceIds),
      this.enrichment.getChannelNames(channelIds),
    ]);

    const enriched = streams.map((s) => ({
      ...s,
      m3uSourceName: s.m3uSourceId ? (sourceNames.get(s.m3uSourceId) ?? null) : null,
      sourceChannelName: s.sourceChannelId ? (channelNames.get(s.sourceChannelId) ?? null) : null,
    }));

    return { channel, streams: enriched };
  }
}
