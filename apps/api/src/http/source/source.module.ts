import { Module } from "@nestjs/common";
import { SourceController } from "./source.controller";
import { M3uSourceRepository } from "../../infrastructure/database/m3u-source.repository";
import { XmltvSourceRepository } from "../../infrastructure/database/xmltv-source.repository";
import { RawM3uChannelRepository } from "../../infrastructure/database/raw-m3u-channel.repository";
import { RawXmltvChannelRepository } from "../../infrastructure/database/raw-xmltv-channel.repository";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { CanonicalEpgBindingRepository } from "../../infrastructure/database/canonical-epg-binding.repository";
import { HttpSourceDownloader } from "../../infrastructure/parsers/http-downloader.adapter";
import { M3uParserAdapter } from "../../infrastructure/parsers/m3u-parser.adapter";
import { XmltvParserAdapter } from "../../infrastructure/parsers/xmltv-parser.adapter";
import { FindSourcesUseCase } from "../../application/source-management/find-sources.use-case";
import { FindSourceUseCase } from "../../application/source-management/find-source.use-case";
import { CreateSourceUseCase } from "../../application/source-management/create-source.use-case";
import { UpdateSourceUseCase } from "../../application/source-management/update-source.use-case";
import { DeleteSourceUseCase } from "../../application/source-management/delete-source.use-case";
import { GetSourceEffectivePolicyUseCase } from "../../application/source-management/get-source-effective-policy.use-case";
import { SyncM3uSourceUseCase } from "../../application/channel-catalog/sync-m3u-source.use-case";
import { SyncXmltvSourceUseCase } from "../../application/channel-catalog/sync-xmltv-source.use-case";
import { FindChannelsUseCase } from "../../application/channel-catalog/find-channels.use-case";
import { FindProgrammesUseCase } from "../../application/channel-catalog/find-programmes.use-case";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { BullmqModule } from "../../infrastructure/bullmq/bullmq.module";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [BullmqModule, TaskModule],
  controllers: [SourceController],
  providers: [
    { provide: "M3U_SOURCE_REPOSITORY", useClass: M3uSourceRepository },
    { provide: "XMLTV_SOURCE_REPOSITORY", useClass: XmltvSourceRepository },
    { provide: "RAW_M3U_CHANNEL_REPOSITORY", useClass: RawM3uChannelRepository },
    { provide: "RAW_XMLTV_CHANNEL_REPOSITORY", useClass: RawXmltvChannelRepository },
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    {
      provide: "CANONICAL_EPG_BINDING_REPOSITORY",
      useClass: CanonicalEpgBindingRepository,
    },
    { provide: "SOURCE_DOWNLOADER", useClass: HttpSourceDownloader },
    { provide: "M3U_PARSER", useClass: M3uParserAdapter },
    { provide: "XMLTV_PARSER", useClass: XmltvParserAdapter },
    FindSourcesUseCase,
    FindSourceUseCase,
    CreateSourceUseCase,
    UpdateSourceUseCase,
    DeleteSourceUseCase,
    {
      provide: GetSourceEffectivePolicyUseCase,
      useFactory: (
        m3uRepo: import("@/domain/source-management").IM3uSourceRepository,
        xmltvRepo: import("@/domain/source-management").IXmltvSourceRepository,
      ) => new GetSourceEffectivePolicyUseCase(m3uRepo, xmltvRepo),
      inject: ["M3U_SOURCE_REPOSITORY", "XMLTV_SOURCE_REPOSITORY"],
    },
    SyncM3uSourceUseCase,
    SyncXmltvSourceUseCase,
    FindChannelsUseCase,
    FindProgrammesUseCase,
    EnqueueSyncUseCase,
  ],
})
export class SourceModule {}
