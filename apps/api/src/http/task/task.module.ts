import { Module } from "@nestjs/common";
import { TaskController } from "./task.controller";
import { FindTasksUseCase } from "@/application/task-execution/find-tasks.use-case";
import { FindTaskUseCase } from "@/application/task-execution/find-task.use-case";
import { SyncLogRepository } from "@/infrastructure/database/sync-log.repository";

@Module({
  controllers: [TaskController],
  providers: [
    { provide: "TASK_REPOSITORY", useClass: SyncLogRepository },
    FindTasksUseCase,
    FindTaskUseCase,
  ],
})
export class TaskModule {}
