import { Module } from "@nestjs/common";
import { OutputController } from "./output.controller";
import { CanonicalChannelRepository } from "../../infrastructure/database/canonical-channel.repository";
import { ChannelOverrideRepository } from "../../infrastructure/database/channel-override.repository";
import { ChannelStreamRepository } from "../../infrastructure/database/channel-stream.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { FindCanonicalChannelsUseCase } from "../../application/output-composition/find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../../application/output-composition/generate-m3u-output.use-case";
import { GenerateXmltvOutputUseCase } from "../../application/output-composition/generate-xmltv-output.use-case";

@Module({
  controllers: [OutputController],
  providers: [
    { provide: "CANONICAL_CHANNEL_REPOSITORY", useClass: CanonicalChannelRepository },
    { provide: "CHANNEL_OVERRIDE_REPOSITORY", useClass: ChannelOverrideRepository },
    { provide: "CHANNEL_STREAM_REPOSITORY", useClass: ChannelStreamRepository },
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    FindCanonicalChannelsUseCase,
    GenerateM3uOutputUseCase,
    GenerateXmltvOutputUseCase,
  ],
})
export class OutputModule {}
