import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";
import type { EpgSource } from "../../domain/epg/epg.model";

@Injectable()
export class FindSourceUseCase {
  constructor(
    @Inject("EPG_SOURCE_REPOSITORY")
    private readonly repo: IEpgSourceRepository,
  ) {}

  async execute(id: string): Promise<EpgSource> {
    const source = await this.repo.findById(id);
    if (!source) throw new NotFoundException("Source not found");
    return source;
  }
}
