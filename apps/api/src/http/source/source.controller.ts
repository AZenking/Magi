import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Put,
  Delete,
  Query,
  HttpCode,
  BadRequestException,
  Inject,
  UseGuards,
} from "@nestjs/common";
import type {
  ApiResponse,
  PaginatedResponse,
  SourceVo,
  CreateSource,
  UpdateSource,
  SourceEffectivePolicy,
} from "@magi/types";
import {
  CreateSourceSchema,
  UpdateSourceSchema,
  SourceQuerySchema,
} from "@magi/types";
import type { M3uSource } from "../../domain/source-management";
import { FindSourcesUseCase } from "../../application/source-management/find-sources.use-case";
import {
  FindSourceUseCase,
  type AnySource,
} from "../../application/source-management/find-source.use-case";
import {
  CreateSourceUseCase,
  type CreatedSource,
} from "../../application/source-management/create-source.use-case";
import {
  UpdateSourceUseCase,
  type UpdatedSource,
} from "../../application/source-management/update-source.use-case";
import { PrepareOperationPreviewUseCase } from "../../application/operation-safety/prepare-operation-preview.use-case";
import { OperationChangeSetRepository } from "../../infrastructure/database/operation-change-set.repository";
import { SyncLogRepository } from "../../infrastructure/database/sync-log.repository";
import { GetSourceEffectivePolicyUseCase } from "../../application/source-management/get-source-effective-policy.use-case";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { BullmqTaskQueueAdapter } from "../../infrastructure/bullmq/task-queue.adapter";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { AppendAuditEventUseCase } from "../../application/audit/append-audit-event.use-case";
import {
  AUDIT_ACTIONS,
  changedFieldNames,
} from "../../domain/audit/audit-actions";

function toVo(source: AnySource | CreatedSource | UpdatedSource): SourceVo {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url,
    enabled: source.enabled,
    role: source.role,
    priority: source.priority,
    participateInOutput: source.participateInOutput,
    allowFallback:
      source.type === "m3u" ? (source as M3uSource).allowFallback : true,
    failureCount: source.failureCount,
    lastSyncAt: source.lastSyncAt?.toISOString() ?? undefined,
    lastSyncStatus: source.lastSyncStatus,
    lastCheckAt: source.lastCheckAt?.toISOString() ?? undefined,
    checkStatus: source.checkStatus,
    checkResponseTime: source.checkResponseTime ?? undefined,
    checkError: source.checkError ?? undefined,
    qualityScore: source.qualityScore,
    version: source.version ?? 1,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

@Controller("sources")
@UseGuards(AuthGuard)
export class SourceController {
  constructor(
    @Inject(FindSourcesUseCase)
    private readonly findSources: FindSourcesUseCase,
    @Inject(FindSourceUseCase) private readonly findSource: FindSourceUseCase,
    @Inject(CreateSourceUseCase)
    private readonly createSource: CreateSourceUseCase,
    @Inject(UpdateSourceUseCase)
    private readonly updateSource: UpdateSourceUseCase,
    @Inject(GetSourceEffectivePolicyUseCase)
    private readonly effectivePolicy: GetSourceEffectivePolicyUseCase,
    @Inject(EnqueueSyncUseCase)
    private readonly enqueueSync: EnqueueSyncUseCase,
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: BullmqTaskQueueAdapter,
    @Inject(AppendAuditEventUseCase)
    private readonly audit: AppendAuditEventUseCase,
  ) {}

  @Get()
  async findAll(
    @Query() query: unknown,
  ): Promise<ApiResponse<PaginatedResponse<SourceVo>>> {
    const parsed = SourceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const {
      type,
      search,
      page = 1,
      pageSize = 20,
      sortBy,
      sortDir,
    } = parsed.data;

    const { items, total } = await this.findSources.execute(type, {
      search,
      page,
      pageSize,
      sortBy: sortBy ?? "createdAt",
      sortDir: sortDir ?? "desc",
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

  @Get(":type/:id")
  async findOne(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
  ): Promise<ApiResponse<SourceVo>> {
    const source = await this.findSource.execute(id, type);
    return { success: true, data: toVo(source) };
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<SourceVo>> {
    const parsed = CreateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.createSource.execute(parsed.data as CreateSource);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.source.create,
      targetType: "source",
      targetId: source.id,
      displayName: source.name,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: {
        sourceType: source.type,
        changedFieldNames: changedFieldNames(parsed.data),
      },
    });
    return { success: true, data: toVo(source) };
  }

  @Put(":type/:id")
  async update(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<SourceVo>> {
    const parsed = UpdateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.updateSource.execute(
      id,
      type,
      parsed.data as UpdateSource,
    );
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.source.update,
      targetType: "source",
      targetId: id,
      displayName: source.name,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: {
        sourceType: type,
        changedFieldNames: changedFieldNames(parsed.data),
      },
    });
    return { success: true, data: toVo(source) };
  }

  @Delete(":type/:id")
  @HttpCode(202)
  async remove(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
  ): Promise<
    ApiResponse<{
      changeSetId: string;
      task: { id: string; statusUrl: string };
    }>
  > {
    const source = await this.findSource.execute(id, type);
    // Deletion is a high-risk operation. Keep the legacy DELETE route as a
    // compatibility entry point, but route it through the same preview/apply
    // protocol used by the dashboard so no request can bypass impact review,
    // recovery capture, and source-scoped leasing.
    const prepare = new PrepareOperationPreviewUseCase(
      new OperationChangeSetRepository(),
      new SyncLogRepository(),
      this.queue,
    );
    const prepared = await prepare.execute({
      kind: "source_delete",
      scopeType: "source",
      scopeId: id,
      sourceId: id,
      parameters: { sourceId: id, sourceType: type },
      inputFingerprint: `source-delete:${type}:${id}:v${source.version ?? 1}`,
      baseVersions: { [`source:${id}`]: source.version ?? 1 },
      requestedBy: user.id,
      requestId: currentRequestId() ?? null,
    });
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.source.delete,
      targetType: "source",
      targetId: id,
      displayName: source.name,
      result: "accepted",
      requestId: currentRequestId(),
      taskId: prepared.taskId,
      summary: { sourceType: type, changeSetId: prepared.changeSetId },
    });
    return {
      success: true,
      data: {
        changeSetId: prepared.changeSetId,
        task: { id: prepared.taskId, statusUrl: prepared.statusUrl },
      },
    };
  }

  @Post(":type/:id/sync")
  @HttpCode(202)
  async sync(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.execute(type, id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.source.syncTrigger,
      targetType: "source",
      targetId: id,
      result: "accepted",
      requestId: currentRequestId(),
      taskId: result.taskId,
      summary: { sourceType: type },
    });
    return { success: true, data: result };
  }

  @Post(":type/:id/check")
  @HttpCode(202)
  async check(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.enqueueSourceCheck(type, id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.source.checkTrigger,
      targetType: "source",
      targetId: id,
      result: "accepted",
      requestId: currentRequestId(),
      taskId: result.taskId,
      summary: { sourceType: type },
    });
    return { success: true, data: result };
  }

  // T119: effective output policy + human summary (contracts/common.md).
  @Get(":type/:id/effective-policy")
  async getEffectivePolicy(
    @Param("type") _type: "m3u" | "xmltv",
    @Param("id") id: string,
  ): Promise<ApiResponse<SourceEffectivePolicy | null>> {
    const data = await this.effectivePolicy.execute(id);
    return { success: true, data };
  }
}
