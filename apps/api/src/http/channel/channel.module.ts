import { Module } from "@nestjs/common";
import { ChannelController } from "./channel.controller";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { FindChannelsUseCase } from "../../application/channel-catalog/find-channels.use-case";
import { FindChannelUseCase } from "../../application/channel-catalog/find-channel.use-case";

@Module({
  controllers: [ChannelController],
  providers: [
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    FindChannelsUseCase,
    FindChannelUseCase,
  ],
})
export class ChannelModule {}
