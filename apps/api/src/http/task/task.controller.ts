import { Controller, Get, Param, Query, Inject, UseGuards } from "@nestjs/common";
import type { ApiResponse, PaginatedResponse } from "@magi/types";
import type { Task, TaskStatus } from "../../domain/task-execution";
import { FindTasksUseCase } from "../../application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "../../application/task-execution/find-task.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

function toVo(task: Task) {
  return {
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
    createdAt: task.createdAt.toISOString(),
  };
}

@Controller("tasks")
@UseGuards(AuthGuard)
export class TaskController {
  constructor(
    @Inject(FindTasksUseCase) private readonly findTasks: FindTasksUseCase,
    @Inject(FindTaskUseCase) private readonly findTask: FindTaskUseCase,
  ) {}

  @Get()
  async findAll(
    @Query() query: { page?: string; pageSize?: string; status?: string; sourceType?: string; taskType?: string },
  ): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const { items, total } = await this.findTasks.execute({
      page: parseInt(query.page ?? "1", 10),
      pageSize: parseInt(query.pageSize ?? "20", 10),
      status: query.status as TaskStatus | undefined,
      sourceType: query.sourceType,
      taskType: query.taskType,
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
}
