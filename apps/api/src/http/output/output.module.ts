import { Module } from "@nestjs/common";
import { OutputController } from "./output.controller";
import { CanonicalChannelRepository } from "../../infrastructure/database/canonical-channel.repository";
import { ChannelOverrideRepository } from "../../infrastructure/database/channel-override.repository";
import { ChannelStreamRepository } from "../../infrastructure/database/channel-stream.repository";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { RawXmltvChannelRepository } from "../../infrastructure/database/raw-xmltv-channel.repository";
import { CanonicalEpgBindingRepository } from "../../infrastructure/database/canonical-epg-binding.repository";
import { StreamEnrichmentService } from "../../infrastructure/database/stream-enrichment.service";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";
import {
  GenerateM3uV2OutputUseCase,
  GenerateXmltvV2OutputUseCase,
} from "../../application/output-composition/generate-v2-output.use-cases";
import { FindOutputGuideUseCase } from "../../application/output-composition/output-guide.use-case";
import { UpdateOutputChannelUseCase } from "../../application/output-composition/update-output-channel.use-case";
import { FindOutputChannelDetailUseCase } from "../../application/output-composition/find-output-channel-detail.use-case";
import { ChangeChannelLifecycleUseCase } from "../../application/output-composition/change-channel-lifecycle.use-case";
import { PurgeChannelUseCase } from "../../application/output-composition/purge-channel.use-case";
import { UpdateManualEpgBindingUseCase } from "../../application/output-composition/update-manual-epg-binding.use-case";
import {
  ReorderChannelStreamsUseCase,
  UpdateFailoverPolicyUseCase,
  CheckChannelStreamUseCase,
  EvaluateStreamFailoverUseCase,
} from "../../application/output-composition/channel-failover.use-cases";
import { ChannelFailoverPolicyRepository } from "../../infrastructure/database/channel-failover-policy.repository";
import type { ICanonicalChannelRepository } from "../../domain/output-composition";
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
    { provide: "RAW_XMLTV_CHANNEL_REPOSITORY", useClass: RawXmltvChannelRepository },
    { provide: "CANONICAL_EPG_BINDING_REPOSITORY", useClass: CanonicalEpgBindingRepository },
    { provide: "STREAM_ENRICHMENT_SERVICE", useClass: StreamEnrichmentService },
    FindCanonicalChannelsUseCase,
    GenerateM3uOutputUseCase,
    GenerateXmltvOutputUseCase,
    GenerateM3uV2OutputUseCase,
    GenerateXmltvV2OutputUseCase,
    FindOutputGuideUseCase,
    UpdateOutputChannelUseCase,
    FindOutputChannelDetailUseCase,
    {
      provide: ChangeChannelLifecycleUseCase,
      useFactory: (repo: ICanonicalChannelRepository) => new ChangeChannelLifecycleUseCase(repo),
      inject: ["CANONICAL_CHANNEL_REPOSITORY"],
    },
    {
      provide: PurgeChannelUseCase,
      useFactory: (repo: ICanonicalChannelRepository) => new PurgeChannelUseCase(repo),
      inject: ["CANONICAL_CHANNEL_REPOSITORY"],
    },
    // T069: manual EPG binding — locked bindings survive automatic matching.
    {
      provide: UpdateManualEpgBindingUseCase,
      useFactory: (
        bindingRepo: import("@/domain/output-composition").ICanonicalEpgBindingRepository,
        canonicalRepo: import("@/domain/output-composition").ICanonicalChannelRepository,
        rawXmltvRepo: import("@/domain/channel-catalog").IRawXmltvChannelRepository,
      ) =>
        new UpdateManualEpgBindingUseCase(bindingRepo, canonicalRepo, rawXmltvRepo),
      inject: [
        "CANONICAL_EPG_BINDING_REPOSITORY",
        "CANONICAL_CHANNEL_REPOSITORY",
        "RAW_XMLTV_CHANNEL_REPOSITORY",
      ],
    },
    // T116/T115: failover — policy repository + 4 use cases.
    ChannelFailoverPolicyRepository,
    ReorderChannelStreamsUseCase,
    UpdateFailoverPolicyUseCase,
    CheckChannelStreamUseCase,
    EvaluateStreamFailoverUseCase,
    FindChannelStreamsUseCase,
    CreateChannelStreamUseCase,
    UpdateChannelStreamUseCase,
    DeleteChannelStreamUseCase,
    SetPrimaryStreamUseCase,
    EnqueueSyncUseCase,
    LogoUploadService,
  ],
  // Expose the read-only use-cases consumed by the Open API module
  // (005-open-channels-epg-api). They are pure @Injectable query objects with
  // no mutation surface, so reuse is safe.
  exports: [
    FindCanonicalChannelsUseCase,
    FindOutputChannelDetailUseCase,
    FindOutputGuideUseCase,
    // Repo tokens consumed by ResolvePlaybackUseCase (playback endpoint).
    "CANONICAL_CHANNEL_REPOSITORY",
    "CHANNEL_STREAM_REPOSITORY",
    "CANONICAL_EPG_BINDING_REPOSITORY",
    "PROGRAMME_REPOSITORY",
  ],
})
export class OutputModule {}
