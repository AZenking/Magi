import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ICanonicalChannelRepository, IChannelStreamRepository, CanonicalChannel, ChannelStream } from "@/domain/output-composition";

export interface OutputChannelDetail {
  channel: CanonicalChannel;
  streams: ChannelStream[];
}

@Injectable()
export class FindOutputChannelDetailUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(id: string): Promise<OutputChannelDetail> {
    const channel = await this.canonicalRepo.findById(id);
    if (!channel) throw new NotFoundException("Channel not found");

    const streams = await this.streamRepo.findByCanonicalChannelId(id);
    return { channel, streams };
  }
}
