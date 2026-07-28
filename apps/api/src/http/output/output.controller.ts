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
import type { ApiResponse, UpdateOutputChannel, CanonicalChannelVo, OutputChannelDetailVo, ChannelStreamVo, CreateChannelStream, UpdateChannelStream, ChannelLifecycle, EpgBindingVo, OutputGuideVo, ProgrammeVo } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { IfMatchRequiredGuard, parseIfMatch, etagFor } from "../../shared/http/precondition";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import {
  GenerateM3uV2OutputUseCase,
  GenerateXmltvV2OutputUseCase,
} from "../../application/output-composition/generate-v2-output.use-cases";
import { FindOutputGuideUseCase } from "../../application/output-composition/output-guide.use-case";
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
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { AppendAuditEventUseCase } from "../../application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS, changedFieldNames } from "../../domain/audit/audit-actions";

function toBindingVo(
  channelId: string,
  binding?: import("../../domain/output-composition").CanonicalEpgBindingWithSource | null,
): EpgBindingVo | null {
  if (!binding) return null;
  const threshold = binding.sourceFreshnessThresholdMinutes ?? 24 * 60;
  const sourceStale =
    !!binding.xmltvSourceId &&
    (!binding.sourceLastSyncAt ||
      Date.now() - binding.sourceLastSyncAt.getTime() > threshold * 60 * 1000);
  return {
    xmltvSourceId: binding.xmltvSourceId,
    xmltvSourceName: binding.xmltvSourceName,
    xmltvChannelId: binding.xmltvChannelId,
    outputChannelId: `magi:${channelId}`,
    status: binding.status,
    matchType: binding.matchType,
    locked: binding.locked,
    version: binding.version,
    sourceStale,
  };
}

function toChannelVo(
  ch: import("../../domain/output-composition").CanonicalChannel,
  binding?: import("../../domain/output-composition").CanonicalEpgBindingWithSource | null,
): CanonicalChannelVo {
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
    epgBinding: toBindingVo(ch.id, binding),
  };
}

function toProgrammeVo(
  programme: import("../../domain/channel-catalog").Programme,
): ProgrammeVo {
  return {
    id: programme.id,
    sourceId: programme.sourceId,
    xmltvChannelId: programme.xmltvChannelId,
    title: programme.title,
    subTitle: programme.subTitle,
    desc: programme.desc,
    category: programme.category,
    startAt: programme.startAt.toISOString(),
    stopAt: programme.stopAt.toISOString(),
    createdAt: programme.createdAt.toISOString(),
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
    @Inject(GenerateM3uV2OutputUseCase)
    private readonly generateM3uV2: GenerateM3uV2OutputUseCase,
    @Inject(GenerateXmltvV2OutputUseCase)
    private readonly generateXmltvV2: GenerateXmltvV2OutputUseCase,
    @Inject(FindOutputGuideUseCase)
    private readonly findOutputGuide: FindOutputGuideUseCase,
    @Inject("CANONICAL_EPG_BINDING_REPOSITORY")
    private readonly epgBindingRepo: import("../../domain/output-composition").ICanonicalEpgBindingRepository,
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
    @Inject(LogoUploadService)
    private readonly logoUpload: LogoUploadService,
    @Inject(AppendAuditEventUseCase)
    private readonly audit: AppendAuditEventUseCase,
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
    await this.audit.execute({
      actorType: "user",
      actorId: (req as import("express").Request & { user: { id: string } }).user.id,
      action: AUDIT_ACTIONS.channel.logoUpdate,
      targetType: "channel",
      targetId: id,
      displayName: ch.standardName,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { changedFieldNames: ["standardLogo"] },
    });
    return { success: true, data: toChannelVo(ch) };
  }

  @Post("check-streams")
  async checkStreams(
    @Body() body: { sourceId?: string } | undefined,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.enqueueStreamCheck(body?.sourceId);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamCheckTrigger,
      targetType: body?.sourceId ? "source" : "stream_collection",
      targetId: body?.sourceId ?? "all",
      result: "accepted",
      requestId: currentRequestId(),
      taskId: result.taskId,
    });
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
    const bindings = await this.epgBindingRepo.findByCanonicalChannelIds(
      result.items.map((channel) => channel.id),
    );

    return {
      success: true,
      data: {
        items: result.items.map((channel) =>
          toChannelVo(channel, bindings.get(channel.id)),
        ),
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
    const binding = await this.epgBindingRepo.findByCanonicalChannelId(id);

    // T057: detail resources expose the version as an ETag (contracts/common.md).
    res.setHeader("ETag", etagFor(channel.version ?? 1));
    return {
      success: true,
      data: {
        channel: {
          ...toChannelVo(channel, binding),
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

  @Get("v2/m3u")
  @Header("Content-Type", "audio/mpegurl")
  @Header("Content-Disposition", "attachment; filename=magi-v2.m3u")
  async m3uV2(@Query("mode") mode?: string): Promise<string> {
    return this.generateM3uV2.execute(mode === "all" ? "all" : "primary");
  }

  @Get("v2/xmltv")
  @Header("Content-Type", "application/xml")
  @Header("Content-Disposition", "attachment; filename=magi-v2.xml")
  async xmltvV2(): Promise<string> {
    return this.generateXmltvV2.execute();
  }

  @Get("guide")
  async guide(
    @Query()
    query: {
      from?: string;
      to?: string;
      channelId?: string;
      group?: string;
      search?: string;
      status?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<ApiResponse<OutputGuideVo>> {
    if (!query.from || !query.to) {
      throw new BadRequestException("from and to are required");
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      throw new BadRequestException("Invalid guide time range");
    }
    if (to.getTime() - from.getTime() > 7 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Guide range cannot exceed 7 days");
    }
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20),
    );
    const result = await this.findOutputGuide.execute({
      from,
      to,
      channelId: query.channelId || undefined,
      group: query.group || undefined,
      search: query.search || undefined,
      status: query.status || undefined,
      page,
      pageSize,
    });
    return {
      success: true,
      data: {
        items: result.items.map((item) => ({
          channel: toChannelVo(item.channel, item.binding),
          programmes: item.programmes.map(toProgrammeVo),
          anomalies: item.anomalies,
        })),
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  }

  // T057: reversible lifecycle transition with If-Match (contracts/channels.md).
  @Post("channels/:id/lifecycle")
  @UseGuards(IfMatchRequiredGuard)
  async changeChannelLifecycle(
    @Param("id") id: string,
    @Body() body: { target: ChannelLifecycle; reason?: string },
    @Headers("if-match") ifMatch: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ previous: string; current: string; changedAt: string; purgeAfter: string | null; version: number }>> {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const result = await this.changeLifecycle.execute({
      channelId: id,
      target: body.target,
      reason: body.reason,
      expectedVersion,
    });
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.lifecycleChange,
      targetType: "channel",
      targetId: id,
      displayName: null,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { from: result.previous, to: result.lifecycle },
      reason: body.reason ?? null,
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
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<EpgBindingVo>> {
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
    const enriched = await this.epgBindingRepo.findByCanonicalChannelId(id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.epgBindingUpdate,
      targetType: "channel",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: {
        changedFieldNames: ["xmltvSourceId", "epgChannelId", "locked"],
        locked: body.locked,
      },
      reason: body.reason ?? null,
    });
    return {
      success: true,
      data: toBindingVo(id, enriched ?? { ...result, xmltvSourceName: null, sourceEnabled: null, sourceLastSyncAt: null, sourceFreshnessThresholdMinutes: null })!,
    };
  }

  @Post("channels/batch")
  async batch(
    @Body() body: { ids: string[]; action: "hide" | "show" | "delete" },
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ updated: number }>> {
    if (!body.ids?.length) return { success: true, data: { updated: 0 } };

    if (body.action === "hide" || body.action === "show") {
      const result = await this.updateChannel.batchUpdate(body.ids, { hidden: body.action === "hide" });
      await this.audit.execute({
        actorType: "user",
        actorId: user.id,
        action: AUDIT_ACTIONS.channel.batchUpdate,
        targetType: "channel_batch",
        targetId: currentRequestId() ?? "batch",
        result: "succeeded",
        requestId: currentRequestId(),
        summary: { operation: body.action, requestedCount: body.ids.length, updatedCount: result },
      });
      return { success: true, data: { updated: result } };
    }

    if (body.action === "delete") {
      const result = await this.updateChannel.batchDelete(body.ids);
      await this.audit.execute({
        actorType: "user",
        actorId: user.id,
        action: AUDIT_ACTIONS.channel.batchUpdate,
        targetType: "channel_batch",
        targetId: currentRequestId() ?? "batch",
        result: "succeeded",
        requestId: currentRequestId(),
        summary: { operation: body.action, requestedCount: body.ids.length, updatedCount: result },
      });
      return { success: true, data: { updated: result } };
    }

    return { success: true, data: { updated: 0 } };
  }

  @Put("channels/:id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateOutputChannel,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<CanonicalChannelVo>> {
    const ch = await this.updateChannel.execute(id, body);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.update,
      targetType: "channel",
      targetId: id,
      displayName: ch.standardName,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { changedFieldNames: changedFieldNames(body) },
    });
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
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<ChannelStreamVo>> {
    const stream = await this.createStreamUc.execute(id, body);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamCreate,
      targetType: "stream",
      targetId: stream.id,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { channelId: id, changedFieldNames: changedFieldNames(body) },
    });
    return { success: true, data: toStreamVo(stream) };
  }

  @Put("channels/:id/streams/:streamId")
  async updateStream(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
    @Body() body: UpdateChannelStream,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<ChannelStreamVo>> {
    await this.validateStreamOwnership(id, streamId);
    const stream = await this.updateStreamUc.execute(streamId, body);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamUpdate,
      targetType: "stream",
      targetId: streamId,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { channelId: id, changedFieldNames: changedFieldNames(body) },
    });
    return { success: true, data: toStreamVo(stream) };
  }

  @Delete("channels/:id/streams/:streamId")
  async deleteStream(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<null>> {
    await this.validateStreamOwnership(id, streamId);
    await this.deleteStreamUc.execute(streamId);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamDelete,
      targetType: "stream",
      targetId: streamId,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { channelId: id },
    });
    return { success: true, data: null };
  }

  @Post("channels/:id/streams/:streamId/primary")
  async setPrimary(
    @Param("id") id: string,
    @Param("streamId") streamId: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<ChannelStreamVo>> {
    await this.validateStreamOwnership(id, streamId);
    const stream = await this.setPrimaryStreamUc.execute(streamId);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamSetPrimary,
      targetType: "stream",
      targetId: streamId,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { channelId: id },
    });
    return { success: true, data: toStreamVo(stream) };
  }

  // T120: reorder streams — If-Match on channel, contiguous positions, one primary.
  @Put("channels/:id/streams/order")
  @UseGuards(IfMatchRequiredGuard)
  async updateStreamOrder(
    @Param("id") id: string,
    @Body() body: { streams: Array<{ id: string; position: number; isPrimary: boolean; eligibleForFailover: boolean }> },
    @Headers("if-match") ifMatch: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<ChannelStreamVo[]>> {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const streams = await this.reorderStreams.execute(id, expectedVersion, body.streams);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamReorder,
      targetType: "channel",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { streamCount: body.streams.length },
    });
    return { success: true, data: streams.map(toStreamVo) };
  }

  // T120: failover policy save + read.
  @Put("channels/:id/failover-policy")
  @UseGuards(IfMatchRequiredGuard)
  async updateFailoverPolicy(
    @Param("id") id: string,
    @Body() body: { mode: string; failureThreshold: number; recoveryThreshold: number; cooldownSeconds: number },
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<unknown>> {
    const data = await this.failoverPolicy.execute(id, body as never);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.failoverPolicyUpdate,
      targetType: "channel",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { changedFieldNames: changedFieldNames(body) },
    });
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
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ taskId: string }>> {
    const { stream } = await this.checkStream.execute(id, streamId);
    // Enqueue the single-stream probe via the existing sync adapter.
    const result = await this.enqueueSync.enqueueStreamCheck(stream.id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.channel.streamCheckTrigger,
      targetType: "stream",
      targetId: streamId,
      result: "accepted",
      requestId: currentRequestId(),
      taskId: result.taskId,
      summary: { channelId: id },
    });
    return { success: true, data: result };
  }

  private async validateStreamOwnership(channelId: string, streamId: string): Promise<void> {
    const stream = await this.findStreamsUc.executeFindOne(streamId);
    if (!stream || stream.canonicalChannelId !== channelId) {
      throw new ForbiddenException("Stream does not belong to this channel");
    }
  }
}
