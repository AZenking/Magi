import { Inject, Injectable } from "@nestjs/common";
import type { OpenChannelVo, OpenGroupVo, OpenProgrammeVo } from "@magi/types";
import type {
  ContentManifestRepository,
  ContentRevision,
} from "@/domain/content";
import type {
  CanonicalChannel,
  ICanonicalChannelRepository,
  ICanonicalEpgBindingRepository,
} from "@/domain/output-composition";
import { CanonicalChannelModel } from "@/domain/output-composition";
import type { IProgrammeRepository } from "@/domain/channel-catalog";

export interface ContentSnapshotQuery {
  include: "catalog" | "guide" | "all";
  channelIds: readonly string[];
  from?: Date;
  to?: Date;
}

export interface ContentSnapshotResult {
  revision: ContentRevision;
  generatedAt: Date;
  groups: OpenGroupVo[];
  channels: OpenChannelVo[];
  programmes: OpenProgrammeVo[];
}

@Injectable()
export class FindContentSnapshotUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CANONICAL_EPG_BINDING_REPOSITORY")
    private readonly bindingRepo: ICanonicalEpgBindingRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
    @Inject("CONTENT_MANIFEST_REPOSITORY")
    private readonly manifestRepo: ContentManifestRepository,
  ) {}

  async execute(query: ContentSnapshotQuery): Promise<ContentSnapshotResult> {
    const revision = await this.manifestRepo.getCurrent();
    const includeCatalog = query.include === "catalog" || query.include === "all";
    const includeGuide = query.include === "guide" || query.include === "all";

    const catalog = includeCatalog ? await this.loadCatalog() : { groups: [], channels: [] };
    const programmes = includeGuide
      ? await this.loadGuide(query.channelIds, query.from!, query.to!)
      : [];

    return {
      revision,
      generatedAt: new Date(),
      groups: catalog.groups,
      channels: catalog.channels,
      programmes,
    };
  }

  private async loadCatalog(): Promise<{
    groups: OpenGroupVo[];
    channels: OpenChannelVo[];
  }> {
    const { items } = await this.canonicalRepo.findAll({
      page: 1,
      pageSize: 10_000,
      lifecycle: "active",
    });
    const visible = items.filter((channel) =>
      new CanonicalChannelModel(channel).shouldBeInOutput(),
    );
    const groupCounts = new Map<string, number>();
    for (const channel of visible) {
      const group = channel.standardGroup ?? "未分组";
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    }
    const groups = [...groupCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([name, count]) => ({ name, count }));

    return {
      groups,
      channels: visible.map(toChannelVo),
    };
  }

  private async loadGuide(
    channelIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<OpenProgrammeVo[]> {
    const channels = (await this.canonicalRepo.findByIds(channelIds))
      .filter((channel) =>
        new CanonicalChannelModel(channel).shouldBeInOutput(),
      );
    const bindings = await this.bindingRepo.findByCanonicalChannelIds(
      channels.map((channel) => channel.id),
    );
    const bindingsToLoad = channels
      .map((channel) => bindings.get(channel.id))
      .filter(
        (
          binding,
        ): binding is NonNullable<typeof binding> & {
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
      from,
      to,
    );
    const programmeByBinding = new Map<string, typeof programmes>();
    for (const programme of programmes) {
      const key = `${programme.sourceId}\u0000${programme.xmltvChannelId}`;
      const list = programmeByBinding.get(key) ?? [];
      list.push(programme);
      programmeByBinding.set(key, list);
    }

    return channels.flatMap((channel) => {
      const binding = bindings.get(channel.id);
      if (!binding?.xmltvSourceId || !binding.xmltvChannelId) return [];
      const key = `${binding.xmltvSourceId}\u0000${binding.xmltvChannelId}`;
      return (programmeByBinding.get(key) ?? [])
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((programme) => toProgrammeVo(programme, channel.id));
    });
  }
}

function toChannelVo(channel: CanonicalChannel): OpenChannelVo {
  return {
    id: `magi:${channel.id}`,
    name: channel.standardName,
    group: channel.standardGroup,
    logo: channel.standardLogo,
    channelNumber: channel.channelNumber,
  };
}

function toProgrammeVo(
  programme: {
    title: string | null;
    subTitle: string | null;
    category: string | null;
    startAt: Date;
    stopAt: Date;
  },
  channelId: string,
): OpenProgrammeVo {
  return {
    channelId: `magi:${channelId}`,
    title: programme.title,
    subTitle: programme.subTitle,
    startAt: programme.startAt.toISOString(),
    stopAt: programme.stopAt.toISOString(),
    category: programme.category,
  };
}
