import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { ImportEpgUseCase } from "../../application/epg/import-epg.use-case";
import { RefreshEpgUseCase } from "../../application/epg/refresh-epg.use-case";
import { FindXmltvChannelCandidatesUseCase } from "../../application/channel-catalog/find-xmltv-channel-candidates.use-case";
import { RawXmltvChannelRepository } from "../../infrastructure/database/raw-xmltv-channel.repository";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [TaskModule],
  controllers: [EpgController],
  providers: [
    { provide: "RAW_XMLTV_CHANNEL_REPOSITORY", useClass: RawXmltvChannelRepository },
    EnqueueSyncUseCase,
    ImportEpgUseCase,
    RefreshEpgUseCase,
    FindXmltvChannelCandidatesUseCase,
  ],
})
export class EpgModule {}
