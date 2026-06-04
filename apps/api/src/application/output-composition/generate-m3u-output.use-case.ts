import { Inject, Injectable } from "@nestjs/common";
import type { ICanonicalChannelRepository, CanonicalChannel } from "@/domain/output-composition";
import type { IChannelStreamRepository, ChannelStream } from "@/domain/output-composition";

@Injectable()
export class GenerateM3uOutputUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(): Promise<string> {
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      hidden: false,
    });

    const visible = channels.filter((c) => !c.hidden && !c.disabled);
    const lines: string[] = ["#EXTM3U"];

    for (const ch of visible) {
      const streams = await this.streamRepo.findByCanonicalChannelId(ch.id);
      const primary = streams.find((s) => s.isPrimary) ?? streams[0];
      if (!primary) continue;

      const tvgId = ch.epgChannelId ?? "";
      const tvgName = ch.standardName;
      const tvgLogo = ch.standardLogo ?? "";
      const group = ch.standardGroup ?? "";

      lines.push(
        `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${group}",${ch.standardName}`,
      );
      lines.push(primary.streamUrl);
    }

    return lines.join("\n");
  }
}
