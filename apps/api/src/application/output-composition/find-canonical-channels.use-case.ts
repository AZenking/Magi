import { Inject, Injectable } from "@nestjs/common";
import type { ICanonicalChannelRepository, CanonicalChannel } from "@/domain/output-composition";

export interface FindCanonicalChannelsQuery {
  page: number;
  pageSize: number;
  epgStatus?: string;
  outputStatus?: string;
  hidden?: boolean;
  disabled?: boolean;
  search?: string;
}

@Injectable()
export class FindCanonicalChannelsUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
  ) {}

  async execute(query: FindCanonicalChannelsQuery): Promise<{ items: CanonicalChannel[]; total: number }> {
    return this.canonicalRepo.findAll(query);
  }
}
