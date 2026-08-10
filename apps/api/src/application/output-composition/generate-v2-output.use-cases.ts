import { Inject, Injectable } from "@nestjs/common";
import type {
  ICanonicalChannelRepository,
  ICanonicalEpgBindingRepository,
  IChannelStreamRepository,
  StreamWithSource,
} from "@/domain/output-composition";
import {
  CanonicalChannelModel,
  ChannelStreamModel,
} from "@/domain/output-composition";
import type { IProgrammeRepository } from "@/domain/channel-catalog";
import {
  comparePlaybackLines,
  selectPlaybackLine,
  type PlaybackLine,
} from "@magi/backend-core";

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep player-facing M3U metadata on one line and inside its quoted value. */
function escapeM3uValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function formatXmltvUtc(value: Date): string {
  const pad = (number: number, width = 2) =>
    String(number).padStart(width, "0");
  return `${pad(value.getUTCFullYear(), 4)}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())} +0000`;
}

@Injectable()
export class GenerateM3uV2OutputUseCase {
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
      lifecycle: "active",
    });
    const visible = channels.filter((item) =>
      new CanonicalChannelModel(item).shouldBeInOutput(),
    );
    const streamsByChannel =
      await this.streamRepo.findByCanonicalChannelIdsWithSource?.(
        visible.map((channel) => channel.id),
      );
    const lines = ["#EXTM3U"];
    for (const channel of visible) {
      const streams = streamsByChannel
        ? (streamsByChannel.get(channel.id) ?? [])
        : await this.streamRepo.findByCanonicalChannelIdWithSource(channel.id);
      const available = streams.filter(
        (stream) =>
          stream.sourceParticipateInOutput !== false &&
          stream.eligibleForFailover !== false &&
          new ChannelStreamModel(stream).isAvailable(),
      );
      const selected =
        mode === "all"
          ? [...available].sort(compareStreams)
          : [selectBestStream(available)].filter(
              (stream): stream is StreamWithSource => !!stream,
            );
      for (const stream of selected) {
        const outputId = `magi:${channel.id}`;
        const name = escapeM3uValue(channel.standardName);
        const logo = escapeM3uValue(channel.standardLogo ?? "");
        const group = escapeM3uValue(channel.standardGroup ?? "");
        lines.push(
          `#EXTINF:-1 tvg-id="${outputId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`,
        );
        lines.push(stream.streamUrl);
      }
    }
    return lines.join("\n");
  }
}

@Injectable()
export class GenerateXmltvV2OutputUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CANONICAL_EPG_BINDING_REPOSITORY")
    private readonly bindingRepo: ICanonicalEpgBindingRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(): Promise<string> {
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      lifecycle: "active",
    });
    const visible = channels.filter((channel) =>
      new CanonicalChannelModel(channel).shouldBeInOutput(),
    );
    const bindings = await this.bindingRepo.findByCanonicalChannelIds(
      visible.map((channel) => channel.id),
    );
    const matched = visible
      .map((channel) => ({ channel, binding: bindings.get(channel.id) }))
      .filter(
        (
          item,
        ): item is typeof item & {
          binding: NonNullable<typeof item.binding> & {
            xmltvSourceId: string;
            xmltvChannelId: string;
          };
        } =>
          !!item.binding?.xmltvSourceId &&
          !!item.binding.xmltvChannelId &&
          item.binding.status.startsWith("matched"),
      );
    const programmes = await this.programmeRepo.findBySourceChannelAndRange(
      matched.map(({ binding }) => ({
        sourceId: binding.xmltvSourceId,
        xmltvChannelId: binding.xmltvChannelId,
      })),
    );
    const outputIdsByBinding = new Map<string, string[]>();
    for (const { channel, binding } of matched) {
      const key = `${binding.xmltvSourceId}\u0000${binding.xmltvChannelId}`;
      const outputIds = outputIdsByBinding.get(key) ?? [];
      outputIds.push(`magi:${channel.id}`);
      outputIdsByBinding.set(key, outputIds);
    }
    const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, "<tv>"];
    for (const channel of visible) {
      const outputId = `magi:${channel.id}`;
      lines.push(`  <channel id="${escapeXml(outputId)}">`);
      lines.push(
        `    <display-name>${escapeXml(channel.standardName)}</display-name>`,
      );
      if (channel.standardLogo) {
        lines.push(`    <icon src="${escapeXml(channel.standardLogo)}"/>`);
      }
      lines.push("  </channel>");
    }
    for (const programme of programmes) {
      const outputIds = outputIdsByBinding.get(
        `${programme.sourceId}\u0000${programme.xmltvChannelId}`,
      );
      if (!outputIds) continue;
      for (const outputId of outputIds) {
        lines.push(
          `  <programme start="${formatXmltvUtc(programme.startAt)}" stop="${formatXmltvUtc(programme.stopAt)}" channel="${escapeXml(outputId)}">`,
        );
        if (programme.title)
          lines.push(`    <title>${escapeXml(programme.title)}</title>`);
        if (programme.subTitle)
          lines.push(
            `    <sub-title>${escapeXml(programme.subTitle)}</sub-title>`,
          );
        if (programme.desc)
          lines.push(`    <desc>${escapeXml(programme.desc)}</desc>`);
        if (programme.category)
          lines.push(
            `    <category>${escapeXml(programme.category)}</category>`,
          );
        lines.push("  </programme>");
      }
    }
    lines.push("</tv>");
    return lines.join("\n");
  }
}
