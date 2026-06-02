import { Controller, Get, Param, Query } from "@nestjs/common";
import type { ProgrammeVo, ApiResponse, PaginatedResponse } from "@magi/types";

@Controller("programmes")
export class ProgrammeController {
  @Get()
  async findAll(@Query() query: { page?: number; pageSize?: number; channelId?: string }): Promise<ApiResponse<PaginatedResponse<ProgrammeVo>>> {
    return { success: true };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<ProgrammeVo>> {
    return { success: true };
  }
}
