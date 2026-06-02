import { Module } from "@nestjs/common";
import { EpgController } from "./epg.controller";

@Module({
  controllers: [EpgController],
})
export class EpgModule {}
