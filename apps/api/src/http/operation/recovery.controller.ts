/**
 * Recovery point HTTP controller (T099).
 *
 * Read-only metadata + restore capability. Snapshot payloads are never
 * returned in list/detail (contracts/backups.md). Restore itself goes
 * through POST /operations/previews kind=recovery_restore.
 *
 * Follows the OperationController pattern: the repositories are thin Drizzle
 * adapters with no external runtime dependencies, so direct instantiation is
 * consistent with the rest of this module.
 */
import { Controller, Get, Param, Query, UseGuards, NotFoundException } from "@nestjs/common";
import type { ApiResponse } from "@magi/types";
import { AuthGuard } from "@/shared/guards/auth.guard";
import { RecoveryPointRepository } from "@/infrastructure/database/recovery-point.repository";

function toVo(rp: {
  id: string;
  status: string;
  operationKind: string;
  scopeType: string;
  scopeId: string;
  changeSetId: string | null;
  taskId: string | null;
  itemCount: number;
  checksum: string;
  createdAt: Date;
  expiresAt: Date | null;
}) {
  return {
    id: rp.id,
    status: rp.status,
    operationKind: rp.operationKind,
    scopeType: rp.scopeType,
    scopeId: rp.scopeId,
    changeSetId: rp.changeSetId,
    taskId: rp.taskId,
    itemCount: rp.itemCount,
    checksum: rp.checksum,
    canRestore: rp.status === "ready",
    createdAt: rp.createdAt.toISOString(),
    expiresAt: rp.expiresAt?.toISOString() ?? null,
  };
}

@Controller("recovery-points")
@UseGuards(AuthGuard)
export class RecoveryController {
  private readonly recoveryRepo = new RecoveryPointRepository();

  @Get()
  async list(
    @Query() query: { changeSetId?: string; taskId?: string; scopeId?: string },
  ): Promise<ApiResponse<unknown[]>> {
    if (query.changeSetId) {
      const rp = await this.recoveryRepo.findByChangeSet(query.changeSetId);
      return { success: true, data: rp ? [toVo(rp)] : [] };
    }
    // No global list query exists yet; callers always arrive via change-set/task.
    return { success: true, data: [] };
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<ApiResponse<unknown>> {
    const rp = await this.recoveryRepo.findById(id);
    if (!rp) throw new NotFoundException("Recovery point not found");
    return { success: true, data: toVo(rp) };
  }
}
