import { Controller, Post, Param, Inject, UseGuards, HttpCode } from "@nestjs/common";
import type { ApiResponse } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { ImportEpgUseCase } from "../../application/epg/import-epg.use-case";
import { RefreshEpgUseCase } from "../../application/epg/refresh-epg.use-case";

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
  ) {}

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
}
