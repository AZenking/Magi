import { Module } from "@nestjs/common";
import { OutputController } from "./output.controller";
import { CanonicalChannelRepository } from "../../infrastructure/database/canonical-channel.repository";
import { ChannelOverrideRepository } from "../../infrastructure/database/channel-override.repository";
import { ChannelStreamRepository } from "../../infrastructure/database/channel-stream.repository";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { StreamEnrichmentService } from "../../infrastructure/database/stream-enrichment.service";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import { UpdateOutputChannelUseCase } from "../../application/output-composition/update-output-channel.use-case";
import { FindOutputChannelDetailUseCase } from "../../application/output-composition/find-output-channel-detail.use-case";
import { FindChannelStreamsUseCase, CreateChannelStreamUseCase, UpdateChannelStreamUseCase, DeleteChannelStreamUseCase, SetPrimaryStreamUseCase } from "../../application/output-composition/channel-stream-crud.use-cases";
import { EnqueueSyncUseCase } from "../../application/task-execution/enqueue-sync.use-case";
import { LogoUploadService } from "../../infrastructure/storage/logo-upload.service";
import { TaskModule } from "../task/task.module";

@Module({
  imports: [TaskModule],
  controllers: [OutputController],
  providers: [
    { provide: "CANONICAL_CHANNEL_REPOSITORY", useClass: CanonicalChannelRepository },
    { provide: "CHANNEL_OVERRIDE_REPOSITORY", useClass: ChannelOverrideRepository },
    { provide: "CHANNEL_STREAM_REPOSITORY", useClass: ChannelStreamRepository },
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    { provide: "STREAM_ENRICHMENT_SERVICE", useClass: StreamEnrichmentService },
    FindCanonicalChannelsUseCase,
    GenerateM3uOutputUseCase,
    GenerateXmltvOutputUseCase,
    UpdateOutputChannelUseCase,
    FindOutputChannelDetailUseCase,
    FindChannelStreamsUseCase,
    CreateChannelStreamUseCase,
    UpdateChannelStreamUseCase,
    DeleteChannelStreamUseCase,
    SetPrimaryStreamUseCase,
    EnqueueSyncUseCase,
    LogoUploadService,
  ],
})
export class OutputModule {}
