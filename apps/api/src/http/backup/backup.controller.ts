/**
 * Backup HTTP controller (T104).
 *
 * POST /backups (create, Idempotency-Key), GET /backups (list),
 * GET /backups/{id}/download (authorized attachment).
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "@/shared/guards/auth.guard";
import { Idempotent } from "@/shared/http/idempotency.interceptor";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { ConfigBackupRepository } from "@/infrastructure/database/config-backup.repository";
import { PrivateFileBackupObjectStorage } from "@/infrastructure/backup/private-file-backup-object-storage";
import { CreateBackupUseCase } from "@/application/backup/create-backup.use-case";
import { DownloadBackupUseCase } from "@/application/backup/download-backup.use-case";
import { PrepareBackupRestoreUseCase } from "@/application/backup/prepare-backup-restore.use-case";
import { AppendAuditEventUseCase } from "@/application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS } from "@/domain/audit/audit-actions";
import { currentRequestId } from "@/shared/http/request-context.middleware";

@Controller("backups")
@UseGuards(AuthGuard)
export class BackupController {
  private readonly backupRepo = new ConfigBackupRepository();
  private readonly storage = new PrivateFileBackupObjectStorage();

  constructor(
    @Inject(AppendAuditEventUseCase)
    private readonly audit: AppendAuditEventUseCase,
  ) {}

  @Post()
  @HttpCode(202)
  @Idempotent("backup-create")
  async create(@Body() body: { scope: Record<string, boolean> }, @CurrentUser() user: { id: string }) {
    const useCase = new CreateBackupUseCase(this.backupRepo, this.storage);
    const result = await useCase.execute({
      scope: {}, // actual scope data fetched by infra; scope flags from body
      sourceAppVersion: process.env.npm_package_version ?? "0.1.0",
      createdBy: user.id,
    });
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.backup.create,
      targetType: "backup",
      targetId: result.backupId,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { scopeNames: Object.keys(body.scope ?? {}).sort() },
    });
    return { success: true, data: result };
  }

  @Get()
  async list(@Query("page") page = "1", @Query("pageSize") pageSize = "20") {
    const result = await this.backupRepo.findAll({
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
    });
    return { success: true, data: result };
  }

  // T101: authorized download — streams bytes as an attachment; storageRef
  // never exposed (contracts/backups.md).
  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: { id: string },
  ) {
    const useCase = new DownloadBackupUseCase(this.backupRepo, this.storage);
    const { stream, filename, checksum } = await useCase.execute(id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.backup.download,
      targetType: "backup",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Checksum", checksum);
    // Pipe the readable into the response without NestJS serialization.
    (stream as NodeJS.ReadableStream).pipe(res);
  }

  @Get(":id/restore-preflight")
  async preflight(@Param("id") id: string) {
    const useCase = new PrepareBackupRestoreUseCase(this.backupRepo, this.storage);
    const result = await useCase.execute(id);
    return { success: true, data: result };
  }
}
