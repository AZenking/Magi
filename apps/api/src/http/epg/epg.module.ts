import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { RawXmltvChannelRepository } from "../../infrastructure/database/raw-xmltv-channel.repository";
import { CanonicalChannelRepository } from "../../infrastructure/database/canonical-channel.repository";
import { MatchEpgUseCase } from "../../application/output-composition/match-epg.use-case";

@Module({
  controllers: [EpgController],
  providers: [
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    { provide: "RAW_XMLTV_CHANNEL_REPOSITORY", useClass: RawXmltvChannelRepository },
    { provide: "CANONICAL_CHANNEL_REPOSITORY", useClass: CanonicalChannelRepository },
    MatchEpgUseCase,
  ],
})
export class EpgModule {}
