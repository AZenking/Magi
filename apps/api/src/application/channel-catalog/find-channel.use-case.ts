import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IChannelRepository, Channel } from "@/domain/channel-catalog";

@Injectable()
export class FindChannelUseCase {
  constructor(
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
  ) {}

  async execute(id: string): Promise<Channel> {
    const channel = await this.channelRepo.findById(id);
    if (!channel) throw new NotFoundException("Channel not found");
    return channel;
  }
}
