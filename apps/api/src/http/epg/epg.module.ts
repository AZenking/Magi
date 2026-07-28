import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { ImportEpgUseCase } from "../../application/epg/import-epg.use-case";
import { RefreshEpgUseCase } from "../../application/epg/refresh-epg.use-case";
import { FindXmltvChannelCandidatesUseCase } from "../../application/channel-catalog/find-xmltv-channel-candidates.use-case";
import { GetXmltvSourceReadinessUseCase } from "../../application/channel-catalog/get-xmltv-source-readiness.use-case";
import { RawXmltvChannelRepository } from "../../infrastructure/database/raw-xmltv-channel.repository";
import { XmltvSourceRepository } from "../../infrastructure/database/xmltv-source.repository";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [TaskModule],
  controllers: [EpgController],
  providers: [
    { provide: "RAW_XMLTV_CHANNEL_REPOSITORY", useClass: RawXmltvChannelRepository },
    { provide: "XMLTV_SOURCE_REPOSITORY", useClass: XmltvSourceRepository },
    EnqueueSyncUseCase,
    ImportEpgUseCase,
    RefreshEpgUseCase,
    FindXmltvChannelCandidatesUseCase,
    {
      provide: GetXmltvSourceReadinessUseCase,
      useFactory: (xmltvRepo: import("@/domain/source-management").IXmltvSourceRepository) =>
        new GetXmltvSourceReadinessUseCase(xmltvRepo),
      inject: ["XMLTV_SOURCE_REPOSITORY"],
    },
  ],
})
export class EpgModule {}
