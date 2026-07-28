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
  group?: string;
  // Safe Operations (T057): lifecycle read model filters.
  lifecycle?: string;
  sourcePresence?: string;
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

  async findGroups(): Promise<{ name: string; count: number }[]> {
    return this.canonicalRepo.findGroups();
  }

  /** Per-lifecycle counts for the channel list tabs (T057). */
  async countByLifecycle(): Promise<Record<string, number>> {
    return this.canonicalRepo.countByLifecycle();
  }
}
