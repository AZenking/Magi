import { Inject, Injectable } from "@nestjs/common";
import type { IRawXmltvChannelRepository, RawXmltvChannel } from "@/domain/channel-catalog";

@Injectable()
export class FindXmltvChannelCandidatesUseCase {
  constructor(
    @Inject("RAW_XMLTV_CHANNEL_REPOSITORY")
    private readonly repo: IRawXmltvChannelRepository,
  ) {}

  async execute(params: { sourceId?: string; search?: string; page: number; pageSize: number }): Promise<{ items: RawXmltvChannel[]; total: number }> {
    return this.repo.findCandidates(params);
  }
}
