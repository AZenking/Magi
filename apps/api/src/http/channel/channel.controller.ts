import { Controller, Get, Param, Query, Inject, UseGuards } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse } from "@magi/types";
import type { Channel } from "../../domain/channel-catalog";
import { FindChannelsUseCase } from "../../application/channel-catalog/find-channels.use-case";
import { FindChannelUseCase } from "../../application/channel-catalog/find-channel.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

function toVo(ch: Channel) {
  return {
    id: ch.id,
    channelIdentity: ch.channelIdentity,
    m3uSourceId: ch.m3uSourceId,
    displayName: ch.displayName,
    groupTitle: ch.groupTitle,
    tvgId: ch.tvgId,
    tvgLogo: ch.tvgLogo,
    streamUrl: ch.streamUrl,
    epgChannelId: ch.epgChannelId,
    epgMatchType: ch.epgMatchType,
    active: ch.active,
    streamStatus: ch.streamStatus,
    createdAt: ch.createdAt.toISOString(),
    updatedAt: ch.updatedAt.toISOString(),
  };
}

@Controller("channels")
@UseGuards(AuthGuard)
export class ChannelController {
  constructor(
    @Inject(FindChannelsUseCase)
    private readonly findChannels: FindChannelsUseCase,
    @Inject(FindChannelUseCase)
    private readonly findChannel: FindChannelUseCase,
  ) {}

  @Get()
  async findAll(
    @Query() query: { page?: string; pageSize?: string; sourceId?: string },
  ): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);
    const { items, total } = await this.findChannels.execute({
      page,
      pageSize,
      sourceId: query.sourceId,
    });

    return {
      success: true,
      data: {
        items: items.map(toVo),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<unknown>> {
    const channel = await this.findChannel.execute(id);
    return { success: true, data: toVo(channel) };
  }
}
