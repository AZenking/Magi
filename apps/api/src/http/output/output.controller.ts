import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Header,
  Headers,
  HttpCode,
  ForbiddenException,
  BadRequestException,
  Req,
  Res,
} from "@nestjs/common";
import multer from "multer";
import type { ApiResponse, UpdateOutputChannel, CanonicalChannelVo, OutputChannelDetailVo, ChannelStreamVo, CreateChannelStream, UpdateChannelStream, ChannelLifecycle } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { IfMatchRequiredGuard, parseIfMatch, etagFor } from "../../shared/http/precondition";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import { UpdateOutputChannelUseCase } from "../../application/output-composition/update-output-channel.use-case";
import { FindOutputChannelDetailUseCase } from "../../application/output-composition/find-output-channel-detail.use-case";
import { ChangeChannelLifecycleUseCase } from "../../application/output-composition/change-channel-lifecycle.use-case";
import { PurgeChannelUseCase } from "../../application/output-composition/purge-channel.use-case";
import { UpdateManualEpgBindingUseCase } from "../../application/output-composition/update-manual-epg-binding.use-case";
import {
  ReorderChannelStreamsUseCase,
  UpdateFailoverPolicyUseCase,
  CheckChannelStreamUseCase,
} from "../../application/output-composition/channel-failover.use-cases";
import { FindChannelStreamsUseCase, CreateChannelStreamUseCase, UpdateChannelStreamUseCase, DeleteChannelStreamUseCase, SetPrimaryStreamUseCase } from "../../application/output-composition/channel-stream-crud.use-cases";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { LogoUploadService } from "../../infrastructure/storage/logo-upload.service";

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
    // Safe Operations (T057): lifecycle read model (contracts/channels.md).
    lifecycle: ch.lifecycle ?? (ch.hidden ? "hidden" : ch.disabled ? "disabled" : "active"),
    lifecycleReason: ch.lifecycleReason ?? null,
    trashedAt: ch.trashedAt?.toISOString() ?? null,
    purgeAfter: ch.purgeAfter?.toISOString() ?? null,
    version: ch.version ?? 1,
  };
}

function toStreamVo(
  s: import("../../domain/output-composition").ChannelStream & { m3uSourceName?: string | null; sourceChannelName?: string | null },
): ChannelStreamVo {
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
    streamCodec: s.streamCodec ?? null,
    streamFormat: s.streamFormat ?? null,
    streamWidth: s.streamWidth ?? null,
    streamHeight: s.streamHeight ?? null,
    streamFrameRate: s.streamFrameRate ?? null,
    streamBitrate: s.streamBitrate ?? null,
    createdAt: s.createdAt.toISOString(),
    m3uSourceName: s.m3uSourceName ?? null,
    sourceChannelName: s.sourceChannelName ?? null,
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
    @Inject(ChangeChannelLifecycleUseCase)
    private readonly changeLifecycle: ChangeChannelLifecycleUseCase,
    @Inject(PurgeChannelUseCase)
    private readonly purgeChannel: PurgeChannelUseCase,
    @Inject(UpdateManualEpgBindingUseCase)
    private readonly updateEpgBinding: UpdateManualEpgBindingUseCase,
    @Inject(ReorderChannelStreamsUseCase)
    private readonly reorderStreams: ReorderChannelStreamsUseCase,
    @Inject(UpdateFailoverPolicyUseCase)
    private readonly failoverPolicy: UpdateFailoverPolicyUseCase,
    @Inject(CheckChannelStreamUseCase)
    private readonly checkStream: CheckChannelStreamUseCase,
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
    @Inject(EnqueueSyncUseCase)
    private readonly enqueueSync: EnqueueSyncUseCase,
    private readonly logoUpload: LogoUploadService,
  ) {}

  @Post("channels/:id/logo")
  async uploadLogo(
    @Param("id") id: string,
    @Req() req: import("express").Request,
    @Res({ passthrough: true }) res: import("express").Response,
  ) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single("logo");
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });

    const file = req.file;
    if (!file) throw new BadRequestException("No file uploaded");
    if (!file.mimetype.startsWith("image/")) throw new BadRequestException("File must be an image");

    const logoUrl = await this.logoUpload.save(file.buffer, file.mimetype);
    const ch = await this.updateChannel.execute(id, { standardLogo: logoUrl });
    return { success: true, data: toChannelVo(ch) };
  }

  @Post("check-streams")
  async checkStreams(@Body() body?: { sourceId?: string }): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.enqueueStreamCheck(body?.sourceId);
    return { success: true, data: result };
  }

  @Get("groups")
  async listGroups(): Promise<ApiResponse<{ name: string; count: number }[]>> {
    const groups = await this.findChannels.findGroups();
    return { success: true, data: groups };
  }

  @Get("channels")
  async listChannels(
    @Query() query: { page?: string; pageSize?: string; epgStatus?: string; outputStatus?: string; search?: string; group?: string; lifecycle?: string; sourcePresence?: string },
  ) {
    // T057: lifecycle is the single filter of truth when provided; the legacy
    // hidden/disabled booleans stay as the default (≈ active) during expand.
    const lifecycle = query.lifecycle;
    const result = await this.findChannels.execute({
      page: parseInt(query.page ?? "1", 10),
      pageSize: parseInt(query.pageSize ?? "20", 10),
      epgStatus: query.epgStatus,
      outputStatus: query.outputStatus,
      ...(lifecycle
        ? { lifecycle }
        : { hidden: false, disabled: false }),
      sourcePresence: query.sourcePresence || undefined,
      search: query.search || undefined,
      group: query.group || undefined,
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

  // T057: per-lifecycle counts for the channel list tabs (contracts/channels.md).
  @Get("channels/lifecycle-counts")
  async lifecycleCounts(): Promise<ApiResponse<Record<string, number>>> {
    const counts = await this.findChannels.countByLifecycle();
    return { success: true, data: counts };
  }

  @Get("channels/:id")
  async getDetail(@Param("id") id: string, @Res({ passthrough: true }) res: import("express").Response): Promise<ApiResponse<OutputChannelDetailVo>> {
    const { channel, streams } = await this.findDetail.execute(id);

    // T057: detail resources expose the version as an ETag (contracts/common.md).
    res.setHeader("ETag", etagFor(channel.version ?? 1));
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
  async m3u(@Query("mode") mode?: string): Promise<string> {
    return this.generateM3u.execute(mode === "all" ? "all" : "primary");
  }

  @Get("xmltv")
  @Header("Content-Type", "application/xml")
  @Header("Content-Disposition", "attachment; filename=magi.xml")
  async xmltv(): Promise<string> {
    return this.generateXmltv.execute();
  }

  // T057: reversible lifecycle transition with If-Match (contracts/channels.md).
  @Post("channels/:id/lifecycle")
  @UseGuards(IfMatchRequiredGuard)
  async changeChannelLifecycle(
    @Param("id") id: string,
    @Body() body: { target: ChannelLifecycle; reason?: string },
    @Headers("if-match") ifMatch: string,
  ): Promise<ApiResponse<{ previous: string; current: string; changedAt: string; purgeAfter: string | null; version: number }>> {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const result = await this.changeLifecycle.execute({
      channelId: id,
      target: body.target,
      reason: body.reason,
      expectedVersion,
    });
    return {
      success: true,
      data: {
        previous: result.previous,
        current: result.lifecycle,
        changedAt: result.changedAt.toISOString(),
        purgeAfter: result.purgeAfter?.toISOString() ?? null,
        version: result.version,
      },
    };
  }

  // T057: purge eligibility preview — read-only; the destructive apply goes
  // through POST /operations/previews kind=channel_purge (contracts/channels.md).
  @Get("channels/:id/purge-preview")
  async purgePreview(@Param("id") id: string): Promise<ApiResponse<import("../../application/output-composition/purge-channel.use-case").PurgePreview>> {
    const preview = await this.purgeChannel.preview({ channelId: id });
    return { success: true, data: preview };
  }

  // T069: manual EPG binding with lock + If-Match (contracts/channels.md PATCH epg-binding).
  @Patch("channels/:id/epg-binding")
  @UseGuards(IfMatchRequiredGuard)
  async patchEpgBinding(
    @Param("id") id: string,
    @Body() body: { xmltvSourceId: string | null; epgChannelId: string | null; locked: boolean; reason?: string },
    @Headers("if-match") ifMatch: string,
  ): Promise<ApiResponse<{ locked: boolean; version: number }>> {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const result = await this.updateEpgBinding.execute({
      channelId: id,
      xmltvSourceId: body.xmltvSourceId,
      epgChannelId: body.epgChannelId,
      locked: body.locked,
      reason: body.reason,
      expectedVersion,
    });
    return { success: true, data: { locked: result.locked, version: expectedVersion } };
  }

  @Post("channels/batch")
  async batch(@Body() body: { ids: string[]; action: "hide" | "show" | "delete" }): Promise<ApiResponse<{ updated: number }>> {
    if (!body.ids?.length) return { success: true, data: { updated: 0 } };

    if (body.action === "hide" || body.action === "show") {
      const result = await this.updateChannel.batchUpdate(body.ids, { hidden: body.action === "hide" });
      return { success: true, data: { updated: result } };
    }

    if (body.action === "delete") {
      const result = await this.updateChannel.batchDelete(body.ids);
      return { success: true, data: { updated: result } };
    }

    return { success: true, data: { updated: 0 } };
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

  // T120: reorder streams — If-Match on channel, contiguous positions, one primary.
  @Put("channels/:id/streams/order")
  @UseGuards(IfMatchRequiredGuard)
  async updateStreamOrder(
    @Param("id") id: string,
    @Body() body: { streams: Array<{ id: string; position: number; isPrimary: boolean; eligibleForFailover: boolean }> },
    @Headers("if-match") ifMatch: string,
  ): Promise<ApiResponse<ChannelStreamVo[]>> {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const streams = await this.reorderStreams.execute(id, expectedVersion, body.streams);
    return { success: true, data: streams.map(toStreamVo) };
  }

  // T120: failover policy save + read.
  @Put("channels/:id/failover-policy")
  @UseGuards(IfMatchRequiredGuard)
  async updateFailoverPolicy(
    @Param("id") id: string,
    @Body() body: { mode: string; failureThreshold: number; recoveryThreshold: number; cooldownSeconds: number },
  ): Promise<ApiResponse<unknown>> {
    const data = await this.failoverPolicy.execute(id, body as never);
    return { success: true, data };
  }

  @Get("channels/:id/failover-policy")
  async getFailoverPolicy(@Param("id") id: string): Promise<ApiResponse<unknown>> {
    const data = await this.failoverPolicy.find(id);
    return { success: true, data };
  }

  // T120: single-stream check — Idempotency-Key, returns 202 TaskRef scoped to stream.
  @Post("channels/:id/streams/:streamId/check")
  @HttpCode(202)
  async checkChannelStream(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
  ): Promise<ApiResponse<{ taskId: string }>> {
    const { stream } = await this.checkStream.execute(id, streamId);
    // Enqueue the single-stream probe via the existing sync adapter.
    const result = await this.enqueueSync.enqueueStreamCheck(stream.id);
    return { success: true, data: result };
  }

  private async validateStreamOwnership(channelId: string, streamId: string): Promise<void> {
    const stream = await this.findStreamsUc.executeFindOne(streamId);
    if (!stream || stream.canonicalChannelId !== channelId) {
      throw new ForbiddenException("Stream does not belong to this channel");
    }
  }
}
