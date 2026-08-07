import { Inject, Injectable } from "@nestjs/common";
import type {
  ICanonicalChannelRepository,
  IChannelStreamRepository,
  CanonicalChannel,
} from "@/domain/output-composition";

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
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo?: IChannelStreamRepository,
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

  /**
   * 009-m3u-control-plane T031: return the subset of canonical channels that
   * are eligible for output — they have an active lifecycle AND at least one
   * currently-output-eligible stream (active member → live source stream, or
   * a manual stream that survives source sync).
   *
   * Stale source rows no longer keep a canonical channel "alive" in the output
   * once all of its source streams go missing.
   */
  async findOutputEligible(
    query: FindCanonicalChannelsQuery,
  ): Promise<{ items: CanonicalChannel[]; total: number }> {
    const result = await this.canonicalRepo.findAll(query);
    if (!this.streamRepo) return result;
    const eligible: CanonicalChannel[] = [];
    for (const ch of result.items) {
      if (ch.lifecycle !== "active") continue;
      const streams = await this.streamRepo.findByCanonicalChannelId(ch.id);
      const hasOutputEligibleStream = streams.some((s) => {
        // Manual streams survive source sync (FR-017).
        if (s.origin === "manual") return true;
        // Source streams must not be in missing/purged retention.
        return s.missingSince == null && s.purgedAt == null;
      });
      if (hasOutputEligibleStream) eligible.push(ch);
    }
    return { items: eligible, total: eligible.length };
  }
}
