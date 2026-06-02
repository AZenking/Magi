import { Module } from "@nestjs/common";
import { SourceController } from "./source.controller";
import { EpgSourceRepository } from "../../infrastructure/database/epg-source.repository";
import { FindSourcesUseCase } from "../../application/source/find-sources.use-case";
import { FindSourceUseCase } from "../../application/source/find-source.use-case";
import { CreateSourceUseCase } from "../../application/source/create-source.use-case";
import { UpdateSourceUseCase } from "../../application/source/update-source.use-case";
import { DeleteSourceUseCase } from "../../application/source/delete-source.use-case";

@Module({
  controllers: [SourceController],
  providers: [
    {
      provide: "EPG_SOURCE_REPOSITORY",
      useClass: EpgSourceRepository,
    },
    FindSourcesUseCase,
    FindSourceUseCase,
    CreateSourceUseCase,
    UpdateSourceUseCase,
    DeleteSourceUseCase,
  ],
})
export class SourceModule {}
