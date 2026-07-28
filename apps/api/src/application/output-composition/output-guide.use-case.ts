import { Inject, Injectable } from "@nestjs/common";
import type {
  CanonicalChannel,
  CanonicalEpgBindingWithSource,
  ICanonicalChannelRepository,
  ICanonicalEpgBindingRepository,
} from "@/domain/output-composition";
import type {
  IProgrammeRepository,
  Programme,
} from "@/domain/channel-catalog";

export type OutputGuideAnomaly =
  | "unmatched"
  | "conflict"
  | "source_stale"
  | "empty"
  | "gap"
  | "overlap";

export interface OutputGuideItem {
  channel: CanonicalChannel;
  binding: CanonicalEpgBindingWithSource | null;
  programmes: Programme[];
  anomalies: OutputGuideAnomaly[];
}

export interface OutputGuideQuery {
  from: Date;
  to: Date;
  channelId?: string;
  group?: string;
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class FindOutputGuideUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CANONICAL_EPG_BINDING_REPOSITORY")
    private readonly bindingRepo: ICanonicalEpgBindingRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(
    query: OutputGuideQuery,
  ): Promise<{ items: OutputGuideItem[]; total: number }> {
    const { items: channels } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10000,
      lifecycle: "active",
      group: query.group,
      search: query.search,
    });
    const selectedChannels = query.channelId
      ? channels.filter((channel) => channel.id === query.channelId)
      : channels;
    const bindings = await this.bindingRepo.findByCanonicalChannelIds(
      selectedChannels.map((channel) => channel.id),
    );
    const bindingStatuses = new Set([
      "matched_manual",
      "matched_auto",
      "unmatched",
      "conflict",
    ]);
    const anomalyStatus =
      query.status && !bindingStatuses.has(query.status)
        ? (query.status as OutputGuideAnomaly)
        : undefined;
    const filtered = query.status && !anomalyStatus
      ? selectedChannels.filter(
          (channel) =>
            (bindings.get(channel.id)?.status ?? "unmatched") === query.status,
        )
      : selectedChannels;
    const channelsToLoad = anomalyStatus
      ? filtered
      : filtered.slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        );
    const bindingsToLoad = channelsToLoad
      .map((channel) => bindings.get(channel.id))
      .filter(
        (
          binding,
        ): binding is CanonicalEpgBindingWithSource & {
          xmltvSourceId: string;
          xmltvChannelId: string;
        } =>
          !!binding?.xmltvSourceId &&
          !!binding.xmltvChannelId &&
          binding.status.startsWith("matched"),
      );
    const programmes = await this.programmeRepo.findBySourceChannelAndRange(
      bindingsToLoad.map((binding) => ({
        sourceId: binding.xmltvSourceId,
        xmltvChannelId: binding.xmltvChannelId,
      })),
      query.from,
      query.to,
    );
    const programmesByBinding = new Map<string, Programme[]>();
    for (const programme of programmes) {
      const key = `${programme.sourceId}\u0000${programme.xmltvChannelId}`;
      const list = programmesByBinding.get(key) ?? [];
      list.push(programme);
      programmesByBinding.set(key, list);
    }

    const projected = channelsToLoad.map((channel) => {
        const binding = bindings.get(channel.id) ?? null;
        const key =
          binding?.xmltvSourceId && binding.xmltvChannelId
            ? `${binding.xmltvSourceId}\u0000${binding.xmltvChannelId}`
            : "";
        const channelProgrammes = key
          ? (programmesByBinding.get(key) ?? [])
          : [];
        return {
          channel,
          binding,
          programmes: channelProgrammes,
          anomalies: this.findAnomalies(binding, channelProgrammes),
        };
      });
    if (anomalyStatus) {
      const matching = projected.filter((item) =>
        item.anomalies.includes(anomalyStatus),
      );
      return {
        total: matching.length,
        items: matching.slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        ),
      };
    }
    return {
      total: filtered.length,
      items: projected,
    };
  }

  private findAnomalies(
    binding: CanonicalEpgBindingWithSource | null,
    programmes: Programme[],
  ): OutputGuideAnomaly[] {
    const anomalies = new Set<OutputGuideAnomaly>();
    if (!binding || binding.status === "unmatched") anomalies.add("unmatched");
    if (binding?.status === "conflict") anomalies.add("conflict");
    if (this.isSourceStale(binding)) anomalies.add("source_stale");
    if (binding?.status.startsWith("matched") && programmes.length === 0) {
      anomalies.add("empty");
    }
    const ordered = [...programmes].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (current.startAt < previous.stopAt) anomalies.add("overlap");
      if (
        current.startAt.getTime() - previous.stopAt.getTime() >
        30 * 60 * 1000
      ) {
        anomalies.add("gap");
      }
    }
    return [...anomalies];
  }

  private isSourceStale(
    binding: CanonicalEpgBindingWithSource | null,
  ): boolean {
    if (!binding?.xmltvSourceId) return false;
    if (binding.sourceEnabled === false) return true;
    if (!binding.sourceLastSyncAt) return true;
    const threshold =
      binding.sourceFreshnessThresholdMinutes ?? 24 * 60;
    return (
      Date.now() - binding.sourceLastSyncAt.getTime() >
      threshold * 60 * 1000
    );
  }
}
