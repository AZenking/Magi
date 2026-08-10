/**
 * ResolvePlaybackUseCase (005-open-channels-epg-api playback endpoint).
 *
 * Returns the server-chosen playback decision for a channel: the best line as
 * `primary`, plus the ordered remaining usable lines as `fallbacks` for
 * client-side failover (roadmap §10.3). Mirrors the V2 M3U selection logic
 * (health → primary → position → responseTime) so the playback endpoint and the
 * mature-player M3U agree on "best line".
 *
 * Output-invisible channels yield null (caller → 404). Channels with no usable
 * line yield playable:false.
 */
import { Inject, Injectable } from "@nestjs/common";
import { comparePlaybackLines, type PlaybackLine } from "@magi/backend-core";
import type {
  ICanonicalChannelRepository,
  IChannelStreamRepository,
  StreamWithSource,
} from "@/domain/output-composition";
import { CanonicalChannelModel } from "@/domain/output-composition";

function toPlaybackLine(stream: StreamWithSource): PlaybackLine {
  return {
    id: stream.id,
    isPrimary: stream.isPrimary,
    position: stream.position ?? Number.MAX_SAFE_INTEGER,
    eligibleForFailover: stream.eligibleForFailover !== false,
    healthStatus: stream.healthStatus,
    responseTime: stream.responseTime,
    successRate: stream.successRate,
    sourcePriority: stream.sourcePriority,
    consecutiveFailures: stream.consecutiveFailures,
    origin: stream.origin ?? "source",
    missingSince: stream.missingSince ?? stream.purgedAt ?? null,
  };
}

/**
 * Order streams by the same policy as V2 output: drop sources opted out of
 * output, then health → primary → position → responseTime. Returns ALL usable
 * lines in order (caller splits primary/fallbacks), not just the best.
 */
function orderUsableStreams(streams: StreamWithSource[]): StreamWithSource[] {
  return [...streams]
    .filter(
      (s) =>
        s.sourceParticipateInOutput !== false &&
        s.eligibleForFailover !== false &&
        (s.origin === "manual" ||
          (s.missingSince == null && s.purgedAt == null)),
    )
    .sort((a, b) => comparePlaybackLines(toPlaybackLine(a), toPlaybackLine(b)));
}

/** A line is usable if it is online or unknown (matches ChannelStreamModel.isAvailable). */
function isUsable(s: StreamWithSource): boolean {
  return s.healthStatus === "online" || s.healthStatus === "unknown";
}

export interface ResolvedPlayback {
  channelId: string;
  playable: boolean;
  primary: {
    streamId: string;
    url: string;
    format: string | null;
    health: string;
  } | null;
  fallbacks: {
    streamId: string;
    url: string;
    format: string | null;
    health: string;
  }[];
}

@Injectable()
export class ResolvePlaybackUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly channelRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  /**
   * @returns null when the channel does not exist or is not output-visible
   *   (caller maps to 404); otherwise a ResolvedPlayback (playable=false when
   *   no usable line exists).
   */
  async execute(channelId: string): Promise<ResolvedPlayback | null> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || !new CanonicalChannelModel(channel).shouldBeInOutput()) {
      return null;
    }
    const streams =
      await this.streamRepo.findByCanonicalChannelIdWithSource(channelId);
    const ordered = orderUsableStreams(streams).filter(isUsable);

    const toLine = (s: StreamWithSource) => ({
      streamId: s.id,
      url: s.streamUrl,
      format: s.streamFormat,
      health: s.healthStatus,
    });

    return {
      channelId: `magi:${channelId}`,
      playable: ordered.length > 0,
      primary: ordered[0] ? toLine(ordered[0]) : null,
      fallbacks: ordered
        .slice(1)
        .filter(
          (stream) =>
            stream.origin === "manual" || stream.sourceAllowFallback !== false,
        )
        .map(toLine),
    };
  }
}
