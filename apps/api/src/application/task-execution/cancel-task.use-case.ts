import { Inject, Injectable } from "@nestjs/common";
import type { ITaskRepository, TaskQueuePort } from "@/domain/task-execution";

@Injectable()
export class CancelTaskUseCase {
  constructor(
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(id: string): Promise<boolean> {
    const task = await this.taskRepo.findById(id);
    if (!task) return false;
    if (task.status !== "pending" && task.status !== "running") return false;
    return this.queue.cancel(id);
  }
}
