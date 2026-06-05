import { Controller, Post, Param, Inject, UseGuards, HttpCode } from "@nestjs/common";
import type { ApiResponse } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";

@Controller("epg")
@UseGuards(AuthGuard)
export class EpgController {
  constructor(
    @Inject(EnqueueSyncUseCase)
    private readonly enqueueSync: EnqueueSyncUseCase,
  ) {}

  @Post("match/:sourceId")
  @HttpCode(202)
  async match(@Param("sourceId") sourceId: string): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.enqueueSync.enqueueEpgMatch(sourceId);
    return { success: true, data: result };
  }
}
