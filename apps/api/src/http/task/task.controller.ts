import { Controller, Get, Post, Put, Patch, Param, Query, Body, Inject, UseGuards, BadRequestException, HttpCode } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse, TaskSummaryVo, ScheduledJobVo } from "@magi/types";
import type { Task, TaskStatus, ScheduledJob } from "../../domain/task-execution";
import type { TaskDetail } from "../../application/task-execution/find-task.use-case";
import { FindTasksUseCase } from "../../application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "../../application/task-execution/find-task.use-case";
import { RetryTaskUseCase } from "../../application/task-execution/retry-task.use-case";
import { CancelTaskUseCase } from "../../application/task-execution/cancel-task.use-case";
import { GetTaskSummaryUseCase } from "../../application/task-execution/get-task-summary.use-case";
import { FindScheduledJobsUseCase, UpdateScheduleUseCase, TriggerScheduledJobUseCase } from "../../application/task-execution/schedule.use-cases";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { Idempotent } from "../../shared/http/idempotency.interceptor";

function toVo(task: Task | TaskDetail) {
  const base = {
    id: task.id,
    sourceType: task.sourceType,
    taskType: task.taskType,
    sourceId: task.sourceId,
    status: task.status,
    startedAt: task.startedAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString() ?? null,
    error: task.error,
    progress: task.progress,
    currentStep: task.currentStep,
    importedCount: task.importedCount,
    addedCount: task.addedCount,
    updatedCount: task.updatedCount,
    removedCount: task.removedCount,
    queueName: task.queueName,
    jobId: task.jobId,
    attemptsMade: task.attemptsMade,
    processedOn: task.processedOn?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };

  if ("jobDetail" in task && task.jobDetail) {
    return {
      ...base,
      jobDetail: {
        state: task.jobDetail.state,
        attemptsMade: task.jobDetail.attemptsMade,
        progress: task.jobDetail.progress,
        failedReason: task.jobDetail.failedReason ?? null,
        stacktrace: task.jobDetail.stacktrace ?? null,
        returnValue: task.jobDetail.returnValue ?? null,
        processedOn: task.jobDetail.processedOn ? new Date(task.jobDetail.processedOn).toISOString() : null,
        finishedOn: task.jobDetail.finishedOn ? new Date(task.jobDetail.finishedOn).toISOString() : null,
        jobAvailable: task.jobDetail.jobAvailable,
      },
    };
  }

  return base;
}

/**
 * Map a domain ScheduledJob (flat intervalMs) to the wire ScheduledJobVo
 * (nested schedule/scope). The BullMQ-backed adapter returns a minimal shape
 * (no timeZone/overlapPolicy/version/scope); defaults match the contract
 * (contracts/schedules.md): overlapPolicy=skip, version=0, scope=global.
 */
function toScheduledJobVo(job: ScheduledJob): ScheduledJobVo {
  return {
    id: job.id,
    name: job.name,
    description: job.description ?? "",
    taskType: job.taskType,
    scope: { type: "global", id: job.id },
    enabled: job.enabled,
    schedule:
      job.intervalMs != null
        ? { type: "interval", intervalMs: job.intervalMs }
        : { type: "cron", cronExpression: "0 * * * *" },
    timeZone: "UTC",
    overlapPolicy: "skip",
    nextRunAt: job.nextRunAt ? job.nextRunAt.toISOString() : null,
    lastRunAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
    lastStatus: job.lastStatus,
    lastSkipReason: null,
    version: 0,
  };
}

@Controller("tasks")
@UseGuards(AuthGuard)
export class TaskController {
  constructor(
    @Inject(FindTasksUseCase) private readonly findTasks: FindTasksUseCase,
    @Inject(FindTaskUseCase) private readonly findTask: FindTaskUseCase,
    @Inject(RetryTaskUseCase) private readonly retryTask: RetryTaskUseCase,
    @Inject(CancelTaskUseCase) private readonly cancelTask: CancelTaskUseCase,
    @Inject(GetTaskSummaryUseCase) private readonly taskSummary: GetTaskSummaryUseCase,
    @Inject(FindScheduledJobsUseCase) private readonly findScheduledJobs: FindScheduledJobsUseCase,
    @Inject(UpdateScheduleUseCase) private readonly updateScheduleUc: UpdateScheduleUseCase,
    @Inject(TriggerScheduledJobUseCase) private readonly triggerScheduledJob: TriggerScheduledJobUseCase,
  ) {}

  @Get("scheduled")
  async listScheduled(): Promise<ApiResponse<ScheduledJobVo[]>> {
    const jobs = await this.findScheduledJobs.execute();
    return { success: true, data: jobs.map(toScheduledJobVo) };
  }

  @Post("scheduled/:jobId/trigger")
  async triggerScheduled(@Param("jobId") jobId: string): Promise<ApiResponse<{ taskId: string }>> {
    const result = await this.triggerScheduledJob.execute(jobId);
    return { success: true, data: result };
  }

  // T087: PATCH with full SaveScheduleRequest draft ({enabled, schedule, timeZone, overlapPolicy}).
  @Patch("scheduled/:jobId")
  async updateSchedule(
    @Param("jobId") jobId: string,
    @Body() body: { enabled?: boolean; schedule?: { type: string; intervalMs?: number; cronExpression?: string }; timeZone?: string; overlapPolicy?: string },
  ): Promise<ApiResponse<null>> {
    const intervalMs = body.schedule?.intervalMs;
    if (intervalMs == null) throw new BadRequestException("schedule.intervalMs is required");
    await this.updateScheduleUc.execute(jobId, { intervalMs });
    return { success: true, data: null };
  }

  // T085: compact summary for the global Header (contracts/tasks.md).
  @Get("summary")
  async summary(): Promise<ApiResponse<TaskSummaryVo>> {
    const data = await this.taskSummary.execute();
    return {
      success: true,
      data: {
        runningCount: data.runningCount,
        failedCount: data.failedCount,
        items: data.items.map((it) => ({
          id: it.id,
          type: it.type,
          // Map legacy `success` → `succeeded` at the contract boundary.
          status: (it.status === "success" ? "succeeded" : it.status) as TaskSummaryVo["items"][number]["status"],
          targetDisplayName: it.targetDisplayName,
        })),
      },
    };
  }

  @Get()
  async findAll(
    @Query() query: { page?: string; pageSize?: string; status?: string; sourceType?: string; taskType?: string; queueName?: string },
  ): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const { items, total } = await this.findTasks.execute({
      page: parseInt(query.page ?? "1", 10),
      pageSize: parseInt(query.pageSize ?? "20", 10),
      status: query.status as TaskStatus | undefined,
      sourceType: query.sourceType,
      taskType: query.taskType,
      queueName: query.queueName,
    });

    return {
      success: true,
      data: {
        items: items.map(toVo),
        total,
        page: parseInt(query.page ?? "1", 10),
        pageSize: parseInt(query.pageSize ?? "20", 10),
        totalPages: Math.ceil(total / parseInt(query.pageSize ?? "20", 10)),
      },
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<ApiResponse<unknown>> {
    const task = await this.findTask.execute(id);
    return { success: true, data: toVo(task) };
  }

  @Post(":id/retry")
  @HttpCode(202)
  @Idempotent("task-retry")
  async retry(@Param("id") id: string): Promise<ApiResponse<{ retried: boolean; newTaskId?: string }>> {
    const result = await this.retryTask.execute(id);
    if (!result.retried) throw new BadRequestException("Cannot retry this task");
    return { success: true, data: result };
  }

  @Post(":id/cancel")
  @Idempotent("task-cancel")
  async cancel(@Param("id") id: string): Promise<ApiResponse<boolean>> {
    const result = await this.cancelTask.execute(id);
    if (!result) throw new BadRequestException("Cannot cancel this task");
    return { success: true, data: result };
  }
}
