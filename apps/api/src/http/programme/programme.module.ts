import { Module } from "@nestjs/common";
import { ProgrammeController } from "./programme.controller";

@Module({
  controllers: [ProgrammeController],
})
export class ProgrammeModule {}
