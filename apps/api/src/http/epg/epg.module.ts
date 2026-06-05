import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { ImportEpgUseCase } from "../../application/epg/import-epg.use-case";
import { RefreshEpgUseCase } from "../../application/epg/refresh-epg.use-case";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [TaskModule],
  controllers: [EpgController],
  providers: [EnqueueSyncUseCase, ImportEpgUseCase, RefreshEpgUseCase],
})
export class EpgModule {}
