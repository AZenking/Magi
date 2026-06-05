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
import type { ApiResponse, PaginatedResponse, SourceVo, CreateSource, UpdateSource } from "@magi/types";
import { CreateSourceSchema, UpdateSourceSchema, SourceQuerySchema } from "@magi/types";
import type { M3uSource, XmltvSource } from "../../domain/source-management";
import {
  FindSourcesUseCase,
} from "../../application/source-management/find-sources.use-case";
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
import { DeleteSourceUseCase } from "../../application/source-management/delete-source.use-case";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

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
    allowFallback: source.type === "m3u" ? (source as M3uSource).allowFallback : true,
    failureCount: source.failureCount,
    lastSyncAt: source.lastSyncAt?.toISOString() ?? undefined,
    lastSyncStatus: source.lastSyncStatus,
    lastCheckAt: source.lastCheckAt?.toISOString() ?? undefined,
    checkStatus: source.checkStatus,
    qualityScore: source.qualityScore,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

@Controller("sources")
@UseGuards(AuthGuard)
export class SourceController {
  constructor(
    @Inject(FindSourcesUseCase) private readonly findSources: FindSourcesUseCase,
    @Inject(FindSourceUseCase) private readonly findSource: FindSourceUseCase,
    @Inject(CreateSourceUseCase) private readonly createSource: CreateSourceUseCase,
    @Inject(UpdateSourceUseCase) private readonly updateSource: UpdateSourceUseCase,
    @Inject(DeleteSourceUseCase) private readonly deleteSource: DeleteSourceUseCase,
    @Inject(EnqueueSyncUseCase) private readonly enqueueSync: EnqueueSyncUseCase,
  ) {}

  @Get()
  async findAll(@Query() query: unknown): Promise<ApiResponse<PaginatedResponse<SourceVo>>> {
    const parsed = SourceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { type, search, page = 1, pageSize = 20, sortBy, sortDir } = parsed.data;

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
  async create(@Body() body: unknown): Promise<ApiResponse<SourceVo>> {
    const parsed = CreateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.createSource.execute(parsed.data as CreateSource);
    return { success: true, data: toVo(source) };
  }

  @Put(":type/:id")
  async update(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<SourceVo>> {
    const parsed = UpdateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.updateSource.execute(id, type, parsed.data as UpdateSource);
    return { success: true, data: toVo(source) };
  }

  @Delete(":type/:id")
  async remove(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
  ): Promise<ApiResponse<void>> {
    await this.deleteSource.execute(id, type);
    return { success: true };
  }

  @Post(":type/:id/sync")
  @HttpCode(202)
  async sync(
    @Param("type") type: "m3u" | "xmltv",
    @Param("id") id: string,
  ): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.execute(type, id);
    return { success: true, data: result };
  }
}
