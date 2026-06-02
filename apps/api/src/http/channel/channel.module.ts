import { Module } from "@nestjs/common";
import { ChannelController } from "./channel.controller";

@Module({
  controllers: [ChannelController],
})
export class ChannelModule {}
