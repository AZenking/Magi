import { Inject, Injectable } from "@nestjs/common";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import type { IProgrammeRepository } from "@/domain/channel-catalog";

@Injectable()
export class GenerateXmltvOutputUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(): Promise<string> {
    // T058: lifecycle-aware output exclusion (FR-012).
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      lifecycle: "active",
      hidden: false,
    });

    const withEpg = channels.filter(
      (c) => c.epgChannelId && !c.hidden && !c.disabled && (c.lifecycle ?? "active") === "active",
    );
    const lines: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`, `<tv>`];

    for (const ch of withEpg) {
      lines.push(`  <channel id="${this.escapeXml(ch.epgChannelId!)}">`);
      lines.push(`    <display-name>${this.escapeXml(ch.standardName)}</display-name>`);
      if (ch.standardLogo) {
        lines.push(`    <icon src="${this.escapeXml(ch.standardLogo)}"/>`);
      }
      lines.push(`  </channel>`);
    }

    for (const ch of withEpg) {
      const { items: programmes } = await this.programmeRepo.findByXmltvChannelId(ch.epgChannelId!, {
        page: 1,
        pageSize: 1000,
      });

      for (const prog of programmes) {
        lines.push(`  <programme start="${this.formatXmltvDate(prog.startAt)}" stop="${this.formatXmltvDate(prog.stopAt)}" channel="${this.escapeXml(ch.epgChannelId!)}">`);
        if (prog.title) lines.push(`    <title>${this.escapeXml(prog.title)}</title>`);
        if (prog.desc) lines.push(`    <desc>${this.escapeXml(prog.desc)}</desc>`);
        if (prog.category) lines.push(`    <category>${this.escapeXml(prog.category)}</category>`);
        lines.push(`  </programme>`);
      }
    }

    lines.push(`</tv>`);
    return lines.join("\n");
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  private formatXmltvDate(d: Date): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())} +0000`;
  }
}
