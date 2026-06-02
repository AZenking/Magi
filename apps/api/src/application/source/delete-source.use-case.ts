import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";

@Injectable()
export class DeleteSourceUseCase {
  constructor(
    @Inject("EPG_SOURCE_REPOSITORY")
    private readonly repo: IEpgSourceRepository,
  ) {}

  async execute(id: string): Promise<void> {
    await this.repo.clearChannelBindings(id);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException("源不存在");
  }
}
