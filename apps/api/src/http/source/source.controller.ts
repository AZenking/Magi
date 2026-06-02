import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Put,
  Delete,
  Query,
  BadRequestException,
  Inject,
  UseGuards,
} from "@nestjs/common";
import type { EpgSourceVo, ApiResponse, PaginatedResponse, SourceQuery } from "@magi/types";
import { CreateSourceSchema, UpdateSourceSchema, SourceQuerySchema } from "@magi/types";
import type { EpgSource } from "../../domain/epg/epg.model";
import { FindSourcesUseCase } from "../../application/source/find-sources.use-case";
import { FindSourceUseCase } from "../../application/source/find-source.use-case";
import { CreateSourceUseCase } from "../../application/source/create-source.use-case";
import { UpdateSourceUseCase } from "../../application/source/update-source.use-case";
import { DeleteSourceUseCase } from "../../application/source/delete-source.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

@Controller("sources")
@UseGuards(AuthGuard)
export class SourceController {
  constructor(
    @Inject(FindSourcesUseCase) private readonly findSources: FindSourcesUseCase,
    @Inject(FindSourceUseCase) private readonly findSource: FindSourceUseCase,
    @Inject(CreateSourceUseCase) private readonly createSource: CreateSourceUseCase,
    @Inject(UpdateSourceUseCase) private readonly updateSource: UpdateSourceUseCase,
    @Inject(DeleteSourceUseCase) private readonly deleteSource: DeleteSourceUseCase,
  ) {}

  @Get()
  async findAll(@Query() query: SourceQuery): Promise<ApiResponse<PaginatedResponse<EpgSourceVo>>> {
    const parsed = SourceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { type, search, page = 1, pageSize = 20, sortBy, sortDir } = parsed.data;

    const { items, total } = await this.findSources.execute({
      type,
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

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<EpgSourceVo>> {
    const row = await this.findSource.execute(id);
    return { success: true, data: toVo(row) };
  }

  @Post()
  async create(@Body() body: unknown): Promise<ApiResponse<EpgSourceVo>> {
    const parsed = CreateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const row = await this.createSource.execute(parsed.data);
    return { success: true, data: toVo(row) };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown): Promise<ApiResponse<EpgSourceVo>> {
    const parsed = UpdateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const row = await this.updateSource.execute(id, parsed.data);
    return { success: true, data: toVo(row) };
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<ApiResponse<void>> {
    await this.deleteSource.execute(id);
    return { success: true };
  }
}

function toVo(row: EpgSource): EpgSourceVo {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
