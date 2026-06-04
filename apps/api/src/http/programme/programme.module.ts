import { Module } from "@nestjs/common";
import { ProgrammeController } from "./programme.controller";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { FindProgrammesUseCase } from "../../application/channel-catalog/find-programmes.use-case";
import { FindProgrammeUseCase } from "../../application/channel-catalog/find-programme.use-case";

@Module({
  controllers: [ProgrammeController],
  providers: [
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    FindProgrammesUseCase,
    FindProgrammeUseCase,
  ],
})
export class ProgrammeModule {}
