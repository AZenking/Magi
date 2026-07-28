/**
 * Audit HTTP controller (T104).
 *
 * GET /audit-events (filtered list), GET /audit-events/:id (detail).
 * Detail never returns credentials (constitution VII).
 */
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/shared/guards/auth.guard";
import { AuditEventRepository } from "@/infrastructure/database/audit-event.repository";

@Controller("audit-events")
@UseGuards(AuthGuard)
export class AuditController {
  private readonly auditRepo = new AuditEventRepository();

  @Get()
  async list(
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
    @Query("action") action?: string,
    @Query("result") result?: string,
    @Query("targetType") targetType?: string,
    @Query("targetId") targetId?: string,
    @Query("taskId") taskId?: string,
  ) {
    const items = await this.auditRepo.findAll({
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
      action,
      result: result as never,
      targetType,
      targetId,
      taskId,
    });
    return { success: true, data: items };
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const event = await this.auditRepo.findById(id);
    return { success: true, data: event };
  }
}
