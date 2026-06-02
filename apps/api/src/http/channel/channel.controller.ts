import { Controller, Get, Param, Post, Body, Put, Delete, Query } from "@nestjs/common";
import type { ChannelVo, ApiResponse, PaginatedResponse } from "@magi/types";

@Controller("channels")
export class ChannelController {
  @Get()
  async findAll(@Query() query: { page?: number; pageSize?: number }): Promise<ApiResponse<PaginatedResponse<ChannelVo>>> {
    return { success: true };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<ChannelVo>> {
    return { success: true };
  }

  @Post()
  async create(@Body() body: unknown): Promise<ApiResponse<ChannelVo>> {
    return { success: true };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown): Promise<ApiResponse<ChannelVo>> {
    return { success: true };
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<ApiResponse<void>> {
    return { success: true };
  }
}
