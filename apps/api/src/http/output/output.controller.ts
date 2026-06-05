import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Header,
  ForbiddenException,
} from "@nestjs/common";
import type { ApiResponse, PaginatedResponse, UpdateOutputChannel, CanonicalChannelVo, OutputChannelDetailVo, ChannelStreamVo, CreateChannelStream, UpdateChannelStream } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import { UpdateOutputChannelUseCase } from "../../application/output-composition/update-output-channel.use-case";
import { FindOutputChannelDetailUseCase } from "../../application/output-composition/find-output-channel-detail.use-case";
import { FindChannelStreamsUseCase, CreateChannelStreamUseCase, UpdateChannelStreamUseCase, DeleteChannelStreamUseCase, SetPrimaryStreamUseCase } from "../../application/output-composition/channel-stream-crud.use-cases";

function toChannelVo(ch: import("../../domain/output-composition").CanonicalChannel): CanonicalChannelVo {
  return {
    id: ch.id,
    standardName: ch.standardName,
    standardGroup: ch.standardGroup,
    standardLogo: ch.standardLogo,
    channelNumber: ch.channelNumber,
    hidden: ch.hidden,
    starred: ch.starred,
    epgChannelId: ch.epgChannelId,
    epgMatchType: ch.epgMatchType,
    epgStatus: ch.epgStatus ?? "",
    outputStatus: ch.outputStatus,
    primaryStreamId: ch.primaryStreamId,
    createdAt: ch.createdAt.toISOString(),
    updatedAt: ch.updatedAt.toISOString(),
  };
}

function toStreamVo(s: import("../../domain/output-composition").ChannelStream): ChannelStreamVo {
  return {
    id: s.id,
    canonicalChannelId: s.canonicalChannelId,
    m3uSourceId: s.m3uSourceId,
    rawChannelId: s.rawChannelId,
    sourceChannelId: s.sourceChannelId,
    streamUrl: s.streamUrl,
    isPrimary: s.isPrimary,
    healthStatus: s.healthStatus,
    responseTime: s.responseTime,
    lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
    consecutiveFailures: s.consecutiveFailures,
    streamError: s.streamError,
    createdAt: s.createdAt.toISOString(),
  };
}

@Controller("output")
@UseGuards(AuthGuard)
export class OutputController {
  constructor(
    @Inject(FindCanonicalChannelsUseCase)
    private readonly findChannels: FindCanonicalChannelsUseCase,
    @Inject(GenerateM3uOutputUseCase)
    private readonly generateM3u: GenerateM3uOutputUseCase,
    @Inject(GenerateXmltvOutputUseCase)
    private readonly generateXmltv: GenerateXmltvOutputUseCase,
    @Inject(UpdateOutputChannelUseCase)
    private readonly updateChannel: UpdateOutputChannelUseCase,
    @Inject(FindOutputChannelDetailUseCase)
    private readonly findDetail: FindOutputChannelDetailUseCase,
    @Inject(FindChannelStreamsUseCase)
    private readonly findStreamsUc: FindChannelStreamsUseCase,
    @Inject(CreateChannelStreamUseCase)
    private readonly createStreamUc: CreateChannelStreamUseCase,
    @Inject(UpdateChannelStreamUseCase)
    private readonly updateStreamUc: UpdateChannelStreamUseCase,
    @Inject(DeleteChannelStreamUseCase)
    private readonly deleteStreamUc: DeleteChannelStreamUseCase,
    @Inject(SetPrimaryStreamUseCase)
    private readonly setPrimaryStreamUc: SetPrimaryStreamUseCase,
  ) {}

  @Get("channels")
  async listChannels(
    @Query() query: { page?: string; pageSize?: string; epgStatus?: string; outputStatus?: string },
  ) {
    const result = await this.findChannels.execute({
      page: parseInt(query.page ?? "1", 10),
      pageSize: parseInt(query.pageSize ?? "20", 10),
      epgStatus: query.epgStatus,
      outputStatus: query.outputStatus,
      hidden: false,
    });

    return {
      success: true,
      data: {
        items: result.items.map(toChannelVo),
        total: result.total,
        page: parseInt(query.page ?? "1", 10),
        pageSize: parseInt(query.pageSize ?? "20", 10),
        totalPages: Math.ceil(result.total / parseInt(query.pageSize ?? "20", 10)),
      },
    };
  }

  @Get("channels/:id")
  async getDetail(@Param("id") id: string): Promise<ApiResponse<OutputChannelDetailVo>> {
    const { channel, streams } = await this.findDetail.execute(id);
    return {
      success: true,
      data: {
        channel: {
          ...toChannelVo(channel),
          mergedFromIds: channel.mergedFromIds,
        },
        streams: streams.map(toStreamVo),
      },
    };
  }

  @Get("m3u")
  @Header("Content-Type", "audio/mpegurl")
  @Header("Content-Disposition", "attachment; filename=magi.m3u")
  async m3u(): Promise<string> {
    return this.generateM3u.execute();
  }

  @Get("xmltv")
  @Header("Content-Type", "application/xml")
  @Header("Content-Disposition", "attachment; filename=magi.xml")
  async xmltv(): Promise<string> {
    return this.generateXmltv.execute();
  }

  @Put("channels/:id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateOutputChannel,
  ): Promise<ApiResponse<CanonicalChannelVo>> {
    const ch = await this.updateChannel.execute(id, body);
    return { success: true, data: toChannelVo(ch) };
  }

  @Get("channels/:id/streams")
  async listStreams(@Param("id") id: string): Promise<ApiResponse<ChannelStreamVo[]>> {
    const streams = await this.findStreamsUc.execute(id);
    return { success: true, data: streams.map(toStreamVo) };
  }

  @Post("channels/:id/streams")
  async createStream(
    @Param("id") id: string,
    @Body() body: CreateChannelStream,
  ): Promise<ApiResponse<ChannelStreamVo>> {
    const stream = await this.createStreamUc.execute(id, body);
    return { success: true, data: toStreamVo(stream) };
  }

  @Put("channels/:id/streams/:streamId")
  async updateStream(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
    @Body() body: UpdateChannelStream,
  ): Promise<ApiResponse<ChannelStreamVo>> {
    await this.validateStreamOwnership(id, streamId);
    const stream = await this.updateStreamUc.execute(streamId, body);
    return { success: true, data: toStreamVo(stream) };
  }

  @Delete("channels/:id/streams/:streamId")
  async deleteStream(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
  ): Promise<ApiResponse<null>> {
    await this.validateStreamOwnership(id, streamId);
    await this.deleteStreamUc.execute(streamId);
    return { success: true, data: null };
  }

  @Post("channels/:id/streams/:streamId/primary")
  async setPrimary(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
  ): Promise<ApiResponse<ChannelStreamVo>> {
    await this.validateStreamOwnership(id, streamId);
    const stream = await this.setPrimaryStreamUc.execute(streamId);
    return { success: true, data: toStreamVo(stream) };
  }

  private async validateStreamOwnership(channelId: string, streamId: string): Promise<void> {
    const stream = await this.findStreamsUc.executeFindOne(streamId);
    if (!stream || stream.canonicalChannelId !== channelId) {
      throw new ForbiddenException("Stream does not belong to this channel");
    }
  }
}
