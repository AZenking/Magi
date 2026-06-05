import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ITaskRepository, Task, TaskQueuePort, JobDetail } from "@/domain/task-execution";

export interface TaskDetail extends Task {
  jobDetail: JobDetail | null;
}

@Injectable()
export class FindTaskUseCase {
  constructor(
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(id: string): Promise<TaskDetail> {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundException("Task not found");

    const jobDetail = await this.queue.getJobDetail(task.id, task.queueName);

    return { ...task, jobDetail };
  }
}
