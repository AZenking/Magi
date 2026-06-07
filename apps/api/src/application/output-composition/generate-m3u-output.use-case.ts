import { Inject, Injectable } from "@nestjs/common";
import type { ICanonicalChannelRepository, IChannelStreamRepository, StreamWithSource } from "@/domain/output-composition";
import { ChannelStreamModel } from "@/domain/output-composition";

const healthOrder: Record<string, number> = { online: 0, unknown: 1, degraded: 2, offline: 3 };

function selectBestStream(streams: StreamWithSource[]): StreamWithSource | null {
  if (streams.length === 0) return null;

  // Filter out streams from non-participating sources
  const eligible = streams.filter((s) => s.sourceParticipateInOutput !== false);
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    // 1. isPrimary first
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    // 2. Source priority (higher = better)
    const pa = a.sourcePriority ?? 0;
    const pb = b.sourcePriority ?? 0;
    if (pa !== pb) return pb - pa;
    // 3. Quality: height then bitrate (higher = better)
    const ha = a.streamHeight ?? 0;
    const hb = b.streamHeight ?? 0;
    if (ha !== hb) return hb - ha;
    const ba = a.streamBitrate ?? 0;
    const bb = b.streamBitrate ?? 0;
    if (ba !== bb) return bb - ba;
    // 4. Health then response time
    const hsa = healthOrder[a.healthStatus] ?? 3;
    const hsb = healthOrder[b.healthStatus] ?? 3;
    if (hsa !== hsb) return hsa - hsb;
    return (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity);
  });

  return sorted[0] ?? null;
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
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      hidden: false,
    });

    const visible = channels.filter((c) => !c.hidden && !c.disabled);
    const lines: string[] = ["#EXTM3U"];

    for (const ch of visible) {
      const streams = await this.streamRepo.findByCanonicalChannelIdWithSource(ch.id);

      if (mode === "all") {
        const eligible = streams.filter((s) =>
          s.sourceParticipateInOutput !== false && new ChannelStreamModel(s).isAvailable()
        );
        for (const s of eligible) {
          lines.push(this.extinfLine(ch, s));
          lines.push(s.streamUrl);
        }
      } else {
        const available = streams.filter((s) => new ChannelStreamModel(s).isAvailable());
        const best = selectBestStream(available);
        if (!best) continue;
        lines.push(this.extinfLine(ch, best));
        lines.push(best.streamUrl);
      }
    }

    return lines.join("\n");
  }

  private extinfLine(
    ch: { epgChannelId: string | null; standardName: string; standardLogo: string | null; standardGroup: string | null },
    stream?: StreamWithSource,
  ): string {
    const tvgId = ch.epgChannelId ?? "";
    const tvgName = ch.standardName;
    const tvgLogo = ch.standardLogo ?? "";
    const group = ch.standardGroup ?? "";
    const suffix = stream && !stream.isPrimary ? ` (${stream.m3uSourceId ? "alt" : "backup"})` : "";
    return `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${group}",${ch.standardName}${suffix}`;
  }
}
