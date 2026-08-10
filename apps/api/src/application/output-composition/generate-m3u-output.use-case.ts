import { Inject, Injectable } from "@nestjs/common";
import {
  comparePlaybackLines,
  selectPlaybackLine,
  type PlaybackLine,
} from "@magi/backend-core";
import type {
  ICanonicalChannelRepository,
  IChannelStreamRepository,
  StreamWithSource,
} from "@/domain/output-composition";
import {
  ChannelStreamModel,
  CanonicalChannelModel,
} from "@/domain/output-composition";

function escapeM3uValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * 009-m3u-control-plane T041: filter source-missing streams (manual lines
 * survive) before applying the legacy quality/source-priority sort. The
 * missing-retention rule is owned by the shared helper; v1 keeps its quality
 * preference as a domain-specific tiebreaker.
 */
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

function compareStreams(a: StreamWithSource, b: StreamWithSource): number {
  return comparePlaybackLines(toPlaybackLine(a), toPlaybackLine(b));
}

function selectBestStream(
  streams: StreamWithSource[],
): StreamWithSource | null {
  const selected = selectPlaybackLine(streams.map(toPlaybackLine));
  return selected
    ? (streams.find((stream) => stream.id === selected.id) ?? null)
    : null;
}

@Injectable()
export class GenerateM3uOutputUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(mode: "primary" | "all" = "primary"): Promise<string> {
    // T058: filter by lifecycle=active (single source of truth). Falls back to
    // booleans when lifecycle is unset (expand phase compatibility).
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      lifecycle: "active",
      hidden: false,
    });

    const visible = channels.filter((c) =>
      new CanonicalChannelModel(c).shouldBeInOutput(),
    );
    const lines: string[] = ["#EXTM3U"];

    for (const ch of visible) {
      const streams = await this.streamRepo.findByCanonicalChannelIdWithSource(
        ch.id,
      );

      if (mode === "all") {
        const eligible = streams
          .filter(
            (s) =>
              s.sourceParticipateInOutput !== false &&
              s.eligibleForFailover !== false &&
              new ChannelStreamModel(s).isAvailable(),
          )
          .sort(compareStreams);
        for (const s of eligible) {
          lines.push(this.extinfLine(ch, s));
          lines.push(s.streamUrl);
        }
      } else {
        const available = streams.filter(
          (s) =>
            s.sourceParticipateInOutput !== false &&
            s.eligibleForFailover !== false &&
            new ChannelStreamModel(s).isAvailable(),
        );
        const best = selectBestStream(available);
        if (!best) continue;
        lines.push(this.extinfLine(ch, best));
        lines.push(best.streamUrl);
      }
    }

    return lines.join("\n");
  }

  private extinfLine(
    ch: {
      epgChannelId: string | null;
      standardName: string;
      standardLogo: string | null;
      standardGroup: string | null;
    },
    stream?: StreamWithSource,
  ): string {
    const tvgId = ch.epgChannelId ?? "";
    const tvgName = escapeM3uValue(ch.standardName);
    const tvgLogo = escapeM3uValue(ch.standardLogo ?? "");
    const group = escapeM3uValue(ch.standardGroup ?? "");
    const suffix =
      stream && !stream.isPrimary
        ? ` (${stream.m3uSourceId ? "alt" : "backup"})`
        : "";
    return `#EXTINF:-1 tvg-id="${escapeM3uValue(tvgId)}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${group}",${tvgName}${suffix}`;
  }
}
