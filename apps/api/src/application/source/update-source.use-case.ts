import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";
import type { EpgSource } from "../../domain/epg/epg.model";
import type { UpdateSource } from "@magi/types";

@Injectable()
export class UpdateSourceUseCase {
  constructor(
    @Inject("EPG_SOURCE_REPOSITORY")
    private readonly repo: IEpgSourceRepository,
  ) {}

  async execute(id: string, data: UpdateSource): Promise<EpgSource> {
    const row = await this.repo.update(id, data);
    if (!row) throw new NotFoundException("源不存在");
    return row;
  }
}
