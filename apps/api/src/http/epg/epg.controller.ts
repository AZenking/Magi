import { Controller, Get, Post, Param, Query, Inject, UseGuards, HttpCode } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse, RawXmltvChannelVo, SourceReadiness } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { ImportEpgUseCase } from "../../application/epg/import-epg.use-case";
import { RefreshEpgUseCase } from "../../application/epg/refresh-epg.use-case";
import { FindXmltvChannelCandidatesUseCase } from "../../application/channel-catalog/find-xmltv-channel-candidates.use-case";
import { GetXmltvSourceReadinessUseCase } from "../../application/channel-catalog/get-xmltv-source-readiness.use-case";

@Controller("epg")
@UseGuards(AuthGuard)
export class EpgController {
  constructor(
    @Inject(EnqueueSyncUseCase)
    private readonly enqueueSync: EnqueueSyncUseCase,
    @Inject(ImportEpgUseCase)
    private readonly importEpg: ImportEpgUseCase,
    @Inject(RefreshEpgUseCase)
    private readonly refreshEpg: RefreshEpgUseCase,
    @Inject(FindXmltvChannelCandidatesUseCase)
    private readonly findCandidates: FindXmltvChannelCandidatesUseCase,
    @Inject(GetXmltvSourceReadinessUseCase)
    private readonly readiness: GetXmltvSourceReadinessUseCase,
  ) {}

  @Get("channels")
  async listXmltvChannels(
    @Query() query: { sourceId?: string; search?: string; page?: string; pageSize?: string },
  ): Promise<ApiResponse<PaginatedResponse<RawXmltvChannelVo>>> {
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);
    const { items, total } = await this.findCandidates.execute({
      sourceId: query.sourceId,
      search: query.search,
      page,
      pageSize,
    });
    return {
      success: true,
      data: {
        items: items.map((c) => ({
          id: c.id,
          sourceId: c.sourceId,
          xmltvId: c.xmltvId,
          displayName: c.displayName,
          icon: c.icon ?? null,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Post("match/:sourceId")
  @HttpCode(202)
  async match(@Param("sourceId") sourceId: string): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.enqueueEpgMatch(sourceId);
    return { success: true, data: result };
  }

  @Post("import/:sourceId")
  @HttpCode(202)
  async import(@Param("sourceId") sourceId: string): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.importEpg.execute(sourceId);
    return { success: true, data: result };
  }

  @Post("refresh/:sourceId")
  @HttpCode(202)
  async refresh(@Param("sourceId") sourceId: string): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.refreshEpg.execute(sourceId);
    return { success: true, data: result };
  }

  // T070: XMLTV readiness — canSync/canMatch + blocker repair links (FR-009).
  @Get("sources/:sourceId/readiness")
  async getSourceReadiness(
    @Param("sourceId") sourceId: string,
  ): Promise<ApiResponse<SourceReadiness>> {
    const r = await this.readiness.execute(sourceId);
    return {
      success: true,
      data: {
        canSync: r.canSync,
        canMatch: r.canMatch,
        blockerCodes: [...r.blockerCodes],
      },
    };
  }
}
