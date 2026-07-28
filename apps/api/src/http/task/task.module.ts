import { Module } from "@nestjs/common";
import { TaskController } from "./task.controller";
import { FindTasksUseCase } from "@/application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "@/application/task-execution/find-task.use-case";
import { RetryTaskUseCase } from "@/application/task-execution/retry-task.use-case";
import { CancelTaskUseCase } from "@/application/task-execution/cancel-task.use-case";
import { GetTaskSummaryUseCase } from "@/application/task-execution/get-task-summary.use-case";
import { FindScheduledJobsUseCase, UpdateScheduleUseCase, TriggerScheduledJobUseCase } from "@/application/task-execution/schedule.use-cases";
import { IdempotencyRepository } from "@/infrastructure/database/idempotency.repository";
import { SyncLogRepository } from "@/infrastructure/database/sync-log.repository";
import { BullmqTaskQueueAdapter } from "@/infrastructure/bullmq/task-queue.adapter";
import { BullmqModule } from "@/infrastructure/bullmq/bullmq.module";

@Module({
  imports: [BullmqModule],
  controllers: [TaskController],
  providers: [
    { provide: "TASK_REPOSITORY", useClass: SyncLogRepository },
    { provide: "TASK_QUEUE_PORT", useClass: BullmqTaskQueueAdapter },
    FindTasksUseCase,
    FindTaskUseCase,
    RetryTaskUseCase,
    CancelTaskUseCase,
    {
      provide: GetTaskSummaryUseCase,
      useFactory: (taskRepo: import("@/domain/task-execution").ITaskRepository) =>
        new GetTaskSummaryUseCase(taskRepo),
      inject: ["TASK_REPOSITORY"],
    },
    FindScheduledJobsUseCase,
    UpdateScheduleUseCase,
    TriggerScheduledJobUseCase,
    // Idempotency interceptor needs this repository for retry/cancel dedup.
    IdempotencyRepository,
  ],
  exports: ["TASK_REPOSITORY", "TASK_QUEUE_PORT"],
})
export class TaskModule {}
