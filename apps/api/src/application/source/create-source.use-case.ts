import { Inject, Injectable } from "@nestjs/common";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";
import type { EpgSource } from "../../domain/epg/epg.model";
import type { CreateSource } from "@magi/types";

@Injectable()
export class CreateSourceUseCase {
  constructor(
    @Inject("EPG_SOURCE_REPOSITORY")
    private readonly repo: IEpgSourceRepository,
  ) {}

  async execute(data: CreateSource): Promise<EpgSource> {
    return this.repo.create(data);
  }
}
