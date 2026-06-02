import { Controller, Get, Param, Query } from "@nestjs/common";
import type { TaskVo, ApiResponse, PaginatedResponse } from "@magi/types";

@Controller("tasks")
export class TaskController {
  @Get()
  async findAll(@Query() query: { page?: number; pageSize?: number; status?: string }): Promise<ApiResponse<PaginatedResponse<TaskVo>>> {
    return { success: true };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<TaskVo>> {
    return { success: true };
  }
}
