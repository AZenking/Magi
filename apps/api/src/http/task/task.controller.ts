import { Controller, Get, Post, Param, Query, Inject, UseGuards, BadRequestException } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse } from "@magi/types";
import type { Task, TaskStatus } from "../../domain/task-execution";
import type { TaskDetail } from "../../application/task-execution/find-task.use-case";
import { FindTasksUseCase } from "../../application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "../../application/task-execution/find-task.use-case";
import { RetryTaskUseCase } from "../../application/task-execution/retry-task.use-case";
import { CancelTaskUseCase } from "../../application/task-execution/cancel-task.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

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

@Controller("tasks")
@UseGuards(AuthGuard)
export class TaskController {
  constructor(
    @Inject(FindTasksUseCase) private readonly findTasks: FindTasksUseCase,
    @Inject(FindTaskUseCase) private readonly findTask: FindTaskUseCase,
    @Inject(RetryTaskUseCase) private readonly retryTask: RetryTaskUseCase,
    @Inject(CancelTaskUseCase) private readonly cancelTask: CancelTaskUseCase,
  ) {}

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
  async retry(@Param("id") id: string): Promise<ApiResponse<{ retried: boolean; newTaskId?: string }>> {
    const result = await this.retryTask.execute(id);
    if (!result.retried) throw new BadRequestException("Cannot retry this task");
    return { success: true, data: result };
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string): Promise<ApiResponse<boolean>> {
    const result = await this.cancelTask.execute(id);
    if (!result) throw new BadRequestException("Cannot cancel this task");
    return { success: true, data: result };
  }
}
