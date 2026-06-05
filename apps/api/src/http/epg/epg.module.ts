import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [TaskModule],
  controllers: [EpgController],
  providers: [EnqueueSyncUseCase],
})
export class EpgModule {}
