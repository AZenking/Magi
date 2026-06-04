import { Inject, Injectable } from "@nestjs/common";
import type { IChannelRepository, Channel } from "@/domain/channel-catalog";

export interface FindChannelsQuery {
  page: number;
  pageSize: number;
  sourceId?: string;
}

export interface FindChannelsResult {
  items: Channel[];
  total: number;
}

@Injectable()
export class FindChannelsUseCase {
  constructor(
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
  ) {}

  async execute(query: FindChannelsQuery): Promise<FindChannelsResult> {
    return this.channelRepo.findAll(query);
  }
}
