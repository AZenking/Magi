import { Inject, Injectable } from "@nestjs/common";
import type { ITaskRepository, TaskQueuePort } from "@/domain/task-execution";

export interface RetryResult {
  retried: boolean;
  newTaskId?: string;
}

@Injectable()
export class RetryTaskUseCase {
  constructor(
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(id: string): Promise<RetryResult> {
    const task = await this.taskRepo.findById(id);
    if (!task || task.status !== "failed") return { retried: false };
    return this.queue.retry(id);
  }
}
