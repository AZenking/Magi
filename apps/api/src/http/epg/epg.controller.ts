import { Controller, Get, Post, Param, Inject, UseGuards } from "@nestjs/common";
import type { ApiResponse } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { MatchEpgUseCase } from "../../application/output-composition/match-epg.use-case";

@Controller("epg")
@UseGuards(AuthGuard)
export class EpgController {
  constructor(
    @Inject(MatchEpgUseCase)
    private readonly matchEpg: MatchEpgUseCase,
  ) {}

  @Post("match/:sourceId")
  async match(@Param("sourceId") sourceId: string): Promise<ApiResponse<{ matched: number; unmatched: number; conflicts: number }>> {
    const result = await this.matchEpg.execute(sourceId);
    return { success: true, data: result };
  }
}
