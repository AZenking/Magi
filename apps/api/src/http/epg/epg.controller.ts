import { Controller, Get, Param, Post } from "@nestjs/common";
import type { EpgSourceVo, ApiResponse } from "@magi/types";

@Controller("epg")
export class EpgController {
  @Get("sources")
  async listSources(): Promise<ApiResponse<EpgSourceVo[]>> {
    return { success: true };
  }

  @Get("sources/:id")
  async getSource(@Param("id") id: string): Promise<ApiResponse<EpgSourceVo>> {
    return { success: true };
  }

  @Post("sources/:id/import")
  async importSource(@Param("id") id: string): Promise<ApiResponse<void>> {
    return { success: true };
  }

  @Post("sources/:id/refresh")
  async refreshSource(@Param("id") id: string): Promise<ApiResponse<void>> {
    return { success: true };
  }
}
