import { Inject, Injectable } from "@nestjs/common";
import type { TaskQueuePort, ScheduledJob } from "@/domain/task-execution";

@Injectable()
export class FindScheduledJobsUseCase {
  constructor(@Inject("TASK_QUEUE_PORT") private readonly queue: TaskQueuePort) {}
  async execute(): Promise<ScheduledJob[]> {
    return this.queue.getScheduledJobs();
  }
}

@Injectable()
export class UpdateScheduleUseCase {
  constructor(@Inject("TASK_QUEUE_PORT") private readonly queue: TaskQueuePort) {}
  async execute(jobId: string, config: { intervalMs: number }): Promise<void> {
    return this.queue.updateSchedule(jobId, config);
  }
}

@Injectable()
export class TriggerScheduledJobUseCase {
  constructor(@Inject("TASK_QUEUE_PORT") private readonly queue: TaskQueuePort) {}
  async execute(jobId: string): Promise<{ taskId: string }> {
    return this.queue.triggerScheduledJob(jobId);
  }
}
