import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ITaskRepository, Task } from "@/domain/task-execution";

@Injectable()
export class FindTaskUseCase {
  constructor(
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(id: string): Promise<Task> {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }
}
