import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Header,
} from "@nestjs/common";
import type { ApiResponse, PaginatedResponse, UpdateOutputChannel, CanonicalChannelVo } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import { UpdateOutputChannelUseCase } from "../../application/output-composition/update-output-channel.use-case";

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
        items: result.items.map((ch) => ({
          id: ch.id,
          standardName: ch.standardName,
          standardGroup: ch.standardGroup,
          standardLogo: ch.standardLogo,
          channelNumber: ch.channelNumber,
          hidden: ch.hidden,
          starred: ch.starred,
          epgChannelId: ch.epgChannelId,
          epgMatchType: ch.epgMatchType,
          epgStatus: ch.epgStatus,
          outputStatus: ch.outputStatus,
          primaryStreamId: ch.primaryStreamId,
          createdAt: ch.createdAt.toISOString(),
          updatedAt: ch.updatedAt.toISOString(),
        })),
        total: result.total,
        page: parseInt(query.page ?? "1", 10),
        pageSize: parseInt(query.pageSize ?? "20", 10),
        totalPages: Math.ceil(result.total / parseInt(query.pageSize ?? "20", 10)),
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
    return {
      success: true,
      data: {
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
      },
    };
  }
}
