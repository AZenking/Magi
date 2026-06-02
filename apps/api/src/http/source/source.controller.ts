import { Controller, Get, Param, Post, Body, Put, Delete } from "@nestjs/common";
import type { EpgSourceVo, ApiResponse } from "@magi/types";

@Controller("sources")
export class SourceController {
  @Get()
  async findAll(): Promise<ApiResponse<EpgSourceVo[]>> {
    return { success: true };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<EpgSourceVo>> {
    return { success: true };
  }

  @Post()
  async create(@Body() body: unknown): Promise<ApiResponse<EpgSourceVo>> {
    return { success: true };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown): Promise<ApiResponse<EpgSourceVo>> {
    return { success: true };
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<ApiResponse<void>> {
    return { success: true };
  }
}
