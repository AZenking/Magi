import { Module } from "@nestjs/common";
import { TaskController } from "./task.controller";
import { FindTasksUseCase } from "@/application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "@/application/task-execution/find-task.use-case";
import { RetryTaskUseCase } from "@/application/task-execution/retry-task.use-case";
import { CancelTaskUseCase } from "@/application/task-execution/cancel-task.use-case";
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
  ],
  exports: ["TASK_REPOSITORY", "TASK_QUEUE_PORT"],
})
export class TaskModule {}
