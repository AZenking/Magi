import { Inject, Injectable } from "@nestjs/common";
import type { ITaskRepository, Task, TaskStatus, TaskType } from "@/domain/task-execution";

export interface FindTasksQuery {
  page: number;
  pageSize: number;
  status?: TaskStatus;
  sourceType?: string;
  taskType?: string;
  queueName?: string;
}

@Injectable()
export class FindTasksUseCase {
  constructor(
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(query: FindTasksQuery): Promise<{ items: Task[]; total: number }> {
    return this.taskRepo.findAll(query);
  }
}
