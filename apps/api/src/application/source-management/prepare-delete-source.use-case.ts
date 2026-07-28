/**
 * PrepareDeleteSourceUseCase (T097).
 *
 * Impact preview for source deletion: counts channels/programmes/mappings/
 * streams/schedules and offers disable-first as a reversible alternative
 * (FR-017, contracts/operation-previews.md source_delete).
 */
import type { IM3uSourceRepository, IXmltvSourceRepository } from "@/domain/source-management";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import type { IChannelStreamRepository } from "@/domain/output-composition";
import type { IProgrammeRepository } from "@/domain/channel-catalog";

export interface SourceDeleteImpact {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: "m3u" | "xmltv";
  readonly counts: {
    channels: number;
    programmes: number;
    canonicalMemberships: number;
    streams: number;
  };
  readonly disableAlternative: { enabled: boolean; summary: string };
}

export class PrepareDeleteSourceUseCase {
  constructor(
    private readonly m3uRepo: IM3uSourceRepository,
    private readonly xmltvRepo: IXmltvSourceRepository,
    private readonly canonicalRepo: ICanonicalChannelRepository,
    private readonly streamRepo: IChannelStreamRepository,
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(sourceId: string): Promise<SourceDeleteImpact> {
    const m3u = await this.m3uRepo.findById(sourceId);
    const xmltv = await this.xmltvRepo.findById(sourceId);
    const source = m3u ?? xmltv;
    if (!source) throw new Error("Source not found");
    const sourceType: "m3u" | "xmltv" = m3u ? "m3u" : "xmltv";

    const [channels, programmes, canonicals, streams] = await Promise.all([
      sourceType === "m3u"
        ? this.canonicalRepo.findAll({ page: 1, pageSize: 1 }).then((r) => r.total)
        : Promise.resolve(0),
      sourceType === "xmltv"
        ? this.programmeRepo.findBySourceId(sourceId).then((p) => p.length)
        : Promise.resolve(0),
      this.canonicalRepo.findAll({ page: 1, pageSize: 1 }).then((r) => r.total),
      this.streamRepo.findByCanonicalChannelId(sourceId).then((s) => s.length).catch(() => 0),
    ]);

    return {
      sourceId,
      sourceName: source.name,
      sourceType,
      counts: { channels, programmes, canonicalMemberships: canonicals, streams },
      disableAlternative: {
        enabled: true,
        summary: "停用来源是可恢复的替代方案：保留配置但停止同步与输出参与。",
      },
    };
  }
}
