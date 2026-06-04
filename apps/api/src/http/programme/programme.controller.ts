import { Controller, Get, Param, Query, Inject, UseGuards } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse } from "@magi/types";
import type { Programme } from "../../domain/channel-catalog";
import { FindProgrammesUseCase } from "../../application/channel-catalog/find-programmes.use-case";
import { FindProgrammeUseCase } from "../../application/channel-catalog/find-programme.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

function toVo(p: Programme) {
  return {
    id: p.id,
    sourceId: p.sourceId,
    xmltvChannelId: p.xmltvChannelId,
    title: p.title,
    subTitle: p.subTitle,
    desc: p.desc,
    category: p.category,
    startAt: p.startAt.toISOString(),
    stopAt: p.stopAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

@Controller("programmes")
@UseGuards(AuthGuard)
export class ProgrammeController {
  constructor(
    @Inject(FindProgrammesUseCase)
    private readonly findProgrammes: FindProgrammesUseCase,
    @Inject(FindProgrammeUseCase)
    private readonly findProgramme: FindProgrammeUseCase,
  ) {}

  @Get()
  async findAll(
    @Query() query: { page?: string; pageSize?: string; xmltvChannelId?: string; sourceId?: string },
  ): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const page = parseInt(query.page ?? "1", 10);
    const pageSize = parseInt(query.pageSize ?? "20", 10);
    const { items, total } = await this.findProgrammes.execute({
      page,
      pageSize,
      xmltvChannelId: query.xmltvChannelId,
      sourceId: query.sourceId,
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

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<unknown>> {
    const programme = await this.findProgramme.execute(id);
    return { success: true, data: toVo(programme) };
  }
}
