/**
 * OpenApiController — public read-only channels & EPG (005-open-channels-epg-api).
 *
 * Behind ApiKeyGuard (Bearer/x-api-key), physically isolated from the admin
 * AuthGuard (FR-019). Rate-limited per key (ThrottlerGuard). All responses are
 * PRODUCT-VIEW projections only — never streamUrl, sourceId, health, or
 * internal lifecycle (FR-012). The stable channel id is `magi:{canonicalId}`
 * (FR-015).
 *
 * Contracts: contracts/open-api.md
 */
import {
  Controller,
  Get,
  Param,
  Query,
  Inject,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import type {
  ApiResponse as ApiEnvelope,
  PaginatedResponse,
  OpenChannelVo,
  OpenGroupVo,
  OpenProgrammeVo,
  OpenPlaybackVo,
} from "@magi/types";
import { OpenChannelsQuerySchema, OpenChannelIdParamSchema, OpenEpgQuerySchema } from "@magi/types";
import { ApiKeyGuard } from "../../shared/guards/api-key.guard";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { FindOutputChannelDetailUseCase } from "../../application/output-composition/find-output-channel-detail.use-case";
import { FindOutputGuideUseCase } from "../../application/output-composition/output-guide.use-case";
import { ResolvePlaybackUseCase } from "../../application/open/resolve-playback.use-case";
import type { CanonicalChannel } from "@/domain/output-composition";
import { CanonicalChannelModel } from "@/domain/output-composition";

@ApiTags("开放接口")
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@Controller("api/open/v1")
export class OpenApiController {
  constructor(
    @Inject(FindCanonicalChannelsUseCase)
    private readonly findChannels: FindCanonicalChannelsUseCase,
    @Inject(FindOutputChannelDetailUseCase)
    private readonly findDetail: FindOutputChannelDetailUseCase,
    @Inject(FindOutputGuideUseCase)
    private readonly findGuide: FindOutputGuideUseCase,
    @Inject(ResolvePlaybackUseCase)
    private readonly resolvePlayback: ResolvePlaybackUseCase,
  ) {}

  /** Channel groups with visible-channel counts. */
  @Get("groups")
  @ApiOperation({ summary: "频道分组列表" })
  @ApiResponse({ status: 200, description: "分组及计数" })
  async groups(): Promise<ApiEnvelope<OpenGroupVo[]>> {
    const raw = await this.findChannels.findGroups();
    return { success: true, data: raw.map(toGroupVo) };
  }

  /** Paginated channel list — only output-visible channels (FR-011). */
  @Get("channels")
  @ApiOperation({ summary: "频道列表（分页，仅对外可见）" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "group", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "分页频道（产品视图）" })
  async channels(@Query() query: unknown): Promise<ApiEnvelope<PaginatedResponse<OpenChannelVo>>> {
    const parsed = OpenChannelsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const { items, total } = await this.findChannels.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      group: parsed.data.group,
      search: parsed.data.search,
      // Open API only ever serves output-visible channels: active lifecycle.
      lifecycle: "active",
    });
    // Double-guard with shouldBeInOutput() (FR-011) in case lifecycle is unset.
    const visible = items.filter((ch) => new CanonicalChannelModel(ch).shouldBeInOutput());
    const mapped = visible.map(toChannelVo);
    // Return the REAL total (across all pages), not the current-page length,
    // so multi-page clients can discover subsequent pages.
    return {
      success: true,
      data: {
        items: mapped,
        total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        totalPages: Math.ceil(total / parsed.data.pageSize) || 1,
      },
    };
  }

  /** Single channel detail — no streams/lines (FR-012). */
  @Get("channels/:id")
  @ApiOperation({ summary: "频道详情（不含线路）" })
  @ApiResponse({ status: 200, description: "频道产品视图" })
  @ApiResponse({ status: 404, description: "频道不存在或不可见" })
  async channelDetail(@Param() param: unknown): Promise<ApiEnvelope<OpenChannelVo>> {
    const parsed = OpenChannelIdParamSchema.safeParse(param);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const detail = await this.findDetail.execute(parsed.data.id);
    if (!new CanonicalChannelModel(detail.channel).shouldBeInOutput()) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
    return { success: true, data: toChannelVo(detail.channel) };
  }

  /**
   * EPG within a time window. Window capped at 7 days (FR-014); only
   * output-visible channels' programmes are returned (FR-011/US3-AC3).
   */
  @Get("epg")
  @ApiOperation({ summary: "节目单（时间窗，最长 7 天）" })
  @ApiQuery({ name: "from", required: true, type: String, description: "ISO 8601" })
  @ApiQuery({ name: "to", required: true, type: String, description: "ISO 8601" })
  @ApiQuery({ name: "group", required: false, type: String })
  @ApiQuery({ name: "channelId", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "节目单（产品视图）" })
  @ApiResponse({ status: 400, description: "时间窗超 7 天或格式非法" })
  async epg(@Query() query: unknown): Promise<ApiEnvelope<PaginatedResponse<OpenProgrammeVo>>> {
    const parsed = OpenEpgQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const { items, total } = await this.findGuide.execute({
      from: new Date(parsed.data.from),
      to: new Date(parsed.data.to),
      group: parsed.data.group,
      channelId: parsed.data.channelId,
      search: parsed.data.search,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    // Flatten channels → programmes, keeping only output-visible channels and
    // mapping each programme back to its stable magi:{channelId} (FR-011/FR-015).
    const programmes: OpenProgrammeVo[] = [];
    for (const item of items) {
      if (!new CanonicalChannelModel(item.channel).shouldBeInOutput()) continue;
      for (const p of item.programmes) {
        programmes.push(toProgrammeVo(p, item.channel.id));
      }
    }
    return {
      success: true,
      data: {
        items: programmes,
        total: programmes.length || total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        totalPages: Math.ceil((programmes.length || total) / parsed.data.pageSize) || 1,
      },
    };
  }

  /**
   * Playback decision for a channel — the playable endpoint + ordered fallback
   * lines (roadmap §10.1/§10.3). Unlike the channel list, this surface exposes
   * line URLs (that is its purpose), but still never sourceId/admin fields.
   */
  @Get("channels/:id/playback")
  @ApiOperation({ summary: "频道播放决策（最佳线路 + 备用顺序，直连上游）" })
  @ApiResponse({ status: 200, description: "播放决策" })
  @ApiResponse({ status: 404, description: "频道不存在或不可见" })
  async playback(@Param() param: unknown): Promise<ApiEnvelope<OpenPlaybackVo>> {
    const parsed = OpenChannelIdParamSchema.safeParse(param);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const resolved = await this.resolvePlayback.execute(parsed.data.id);
    if (!resolved) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
    // Decision valid for 5 minutes — client should re-fetch after expiry.
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    return {
      success: true,
      data: {
        channelId: resolved.channelId,
        playable: resolved.playable,
        primary: resolved.primary,
        fallbacks: resolved.fallbacks,
        decisionExpiresAt: expiresAt.toISOString(),
        deliveryMode: "direct",
      },
    };
  }
}

// --- Product-view projections (FR-012: never expose operational fields) ---

function toGroupVo(g: { name: string | null; count: number }): OpenGroupVo {
  return { name: g.name, count: g.count };
}

function toChannelVo(ch: CanonicalChannel): OpenChannelVo {
  return {
    id: `magi:${ch.id}`,
    name: ch.standardName,
    group: ch.standardGroup,
    logo: ch.standardLogo,
    channelNumber: ch.channelNumber,
  };
}

function toProgrammeVo(
  p: { title: string | null; subTitle: string | null; category: string | null; startAt: Date; stopAt: Date },
  channelId: string,
): OpenProgrammeVo {
  return {
    channelId: `magi:${channelId}`,
    title: p.title,
    subTitle: p.subTitle,
    startAt: p.startAt.toISOString(),
    stopAt: p.stopAt.toISOString(),
    category: p.category,
  };
}
