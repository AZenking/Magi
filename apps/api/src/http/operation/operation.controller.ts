/**
 * Operation HTTP controller (T043).
 *
 * Endpoints for the unified high-risk operation protocol
 * (contracts/operation-previews.md). Delegates to the T036 use cases.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards, BadRequestException, Headers as HeadersDecorator } from "@nestjs/common";
import {
  PrepareOperationPreviewUseCase,
  FindOperationChangeSetUseCase,
  UpdateChangeDecisionsUseCase,
  CancelOperationPreviewUseCase,
  ApplyOperationUseCase,
} from "@/application/operation-safety";
import { OperationChangeSetRepository } from "@/infrastructure/database/operation-change-set.repository";
import { OperationLeaseRepository } from "@/infrastructure/database/operation-lease.repository";
import { RecoveryPointRepository } from "@/infrastructure/database/recovery-point.repository";
import { IdempotencyRepository } from "@/infrastructure/database/idempotency.repository";
import { SyncLogRepository } from "@/infrastructure/database/sync-log.repository";
import { AuditEventRepository } from "@/infrastructure/database/audit-event.repository";
import { BullmqTaskQueueAdapter } from "@/infrastructure/bullmq/task-queue.adapter";
import { IfMatchRequiredGuard, parseIfMatch } from "@/shared/http/precondition";
import { Idempotent } from "@/shared/http/idempotency.interceptor";
import { AuthGuard } from "@/shared/guards/auth.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { currentRequestId } from "@/shared/http/request-context.middleware";
import { computeFingerprint } from "@magi/backend-core";
import type { OperationKind, OperationScopeType } from "@magi/types";

@Controller("operations")
@UseGuards(AuthGuard)
export class OperationController {
  private readonly changeSetRepo = new OperationChangeSetRepository();
  private readonly leaseRepo = new OperationLeaseRepository();
  private readonly recoveryRepo = new RecoveryPointRepository();
  private readonly taskRepo = new SyncLogRepository();
  private readonly idempotencyRepo = new IdempotencyRepository();
  private readonly auditRepo = new AuditEventRepository();

  constructor(@Inject("TASK_QUEUE_PORT") private readonly queue: BullmqTaskQueueAdapter) {}

  @Post("previews")
  @HttpCode(202)
  async preparePreview(
    @Body() body: {
      kind: OperationKind;
      scope: { type: OperationScopeType; id: string };
      parameters: Record<string, unknown>;
      expectedVersions: Record<string, number>;
    },
    @CurrentUser() user: { id: string },
  ) {
    const useCase = new PrepareOperationPreviewUseCase(
      this.changeSetRepo,
      this.taskRepo,
      this.queue,
    );
    // Compute a fingerprint from the request (the Worker re-validates against
    // the staged snapshot; this is the request-level fingerprint).
    const fingerprint = computeFingerprint([
      { channelIdentity: body.kind, payload: body.parameters },
    ]);
    const result = await useCase.execute({
      kind: body.kind,
      scopeType: body.scope.type,
      scopeId: body.scope.id,
      sourceId: (body.parameters.sourceId as string) ?? null,
      inputFingerprint: fingerprint,
      baseVersions: body.expectedVersions,
      requestedBy: user.id,
      requestId: currentRequestId() ?? null,
    });
    return {
      success: true,
      data: {
        changeSet: { id: result.changeSetId, status: "preparing" },
        task: { id: result.taskId, statusUrl: result.statusUrl },
      },
    };
  }

  @Get("change-sets/:id")
  async getChangeSet(@Param("id") id: string) {
    const useCase = new FindOperationChangeSetUseCase(this.changeSetRepo, this.changeSetRepo);
    const cs = await useCase.findOne(id);
    return { success: true, data: cs };
  }

  @Get("change-sets/:id/items")
  async getChangeItems(
    @Param("id") id: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
    @Query("classification") classification?: string,
  ) {
    const useCase = new FindOperationChangeSetUseCase(this.changeSetRepo, this.changeSetRepo);
    const result = await useCase.findItems({
      changeSetId: id,
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
      classification,
    });
    return { success: true, data: result };
  }

  @Patch("change-sets/:id/items")
  @UseGuards(IfMatchRequiredGuard)
  async updateDecisions(
    @Param("id") id: string,
    @Body() body: { decisions: Array<{ itemId: string; selected: boolean; candidateId?: string; lockManualDecision?: boolean }> },
    @Query("_ifMatch") _ifMatchHeader: string,
    @Body() fullBody: unknown,
  ) {
    const headers = (fullBody as { __headers?: Record<string, string> })?.__headers;
    const ifMatch = parseIfMatch(headers?.["if-match"] ?? null);
    const useCase = new UpdateChangeDecisionsUseCase(this.changeSetRepo, this.changeSetRepo);
    const result = await useCase.execute({
      changeSetId: id,
      expectedVersion: ifMatch ?? 0,
      decisions: body.decisions,
    });
    return { success: true, data: result };
  }

  @Post("change-sets/:id/apply")
  @HttpCode(202)
  @Idempotent("operation-apply")
  @UseGuards(IfMatchRequiredGuard)
  async apply(
    @Param("id") id: string,
    @Body() body: { confirmedWarningCodes?: string[]; operatorReason?: string },
    @HeadersDecorator("if-match") ifMatch: string,
    @CurrentUser() user: { id: string },
  ) {
    const expectedVersion = parseIfMatch(ifMatch);
    if (expectedVersion === null) throw new BadRequestException("Invalid If-Match header");
    const useCase = new ApplyOperationUseCase(
      this.changeSetRepo,
      this.leaseRepo,
      this.recoveryRepo,
      this.taskRepo,
      this.queue,
      this.idempotencyRepo,
    );
    const result = await useCase.execute({
      changeSetId: id,
      expectedVersion,
      confirmedWarningCodes: body.confirmedWarningCodes ?? [],
      operatorReason: body.operatorReason,
      actorId: user.id,
      requestId: currentRequestId(),
    });
    // Write audit event for the apply operation.
    const cs = await this.changeSetRepo.findById(id);
    await this.auditRepo.append({
      actorType: "user",
      actorId: user.id,
      action: `operation.${cs?.kind ?? "unknown"}.apply`,
      targetType: cs?.scopeType ?? "source",
      targetId: cs?.scopeId ?? id,
      displayName: null,
      result: "accepted",
      requestId: currentRequestId() ?? null,
      taskId: result.taskId,
      parentTaskId: null,
      changeSetId: id,
      recoveryPointId: result.recoveryPointId,
      summary: { operatorReason: body.operatorReason ?? null },
      reason: body.operatorReason ?? null,
    }).catch(() => undefined);
    return {
      success: true,
      data: {
        task: { id: result.taskId, statusUrl: result.statusUrl },
        changeSetId: result.changeSetId,
        recoveryPointId: result.recoveryPointId,
        deduplicated: result.deduplicated,
      },
    };
  }

  @Post("change-sets/:id/cancel")
  @UseGuards(IfMatchRequiredGuard)
  async cancel(@Param("id") id: string) {
    const useCase = new CancelOperationPreviewUseCase(
      this.changeSetRepo,
      this.taskRepo,
      this.queue,
    );
    const result = await useCase.execute({ changeSetId: id, expectedVersion: 0 });
    return { success: true, data: result };
  }
}
