/**
 * PrepareBatchLifecycleUseCase (T055).
 *
 * Produces a batch lifecycle change-set preview: stable IDs, names, current
 * state, target state. Confirmation displays IDs/names/counts — never row
 * indexes (FR-015, contracts/channels.md channel_lifecycle_batch).
 */
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import type { ChannelLifecycle } from "@/domain/output-composition";

export interface BatchLifecycleItem {
  readonly channelId: string;
  readonly standardName: string;
  readonly currentLifecycle: string;
  readonly targetLifecycle: ChannelLifecycle;
}

export interface PrepareBatchLifecycleInput {
  readonly channelIds: readonly string[];
  readonly target: ChannelLifecycle;
}

export class PrepareBatchLifecycleUseCase {
  constructor(private readonly canonicalRepo: ICanonicalChannelRepository) {}

  async execute(input: PrepareBatchLifecycleInput): Promise<{
    items: BatchLifecycleItem[];
    count: number;
  }> {
    const items: BatchLifecycleItem[] = [];
    for (const id of input.channelIds) {
      const channel = await this.canonicalRepo.findById(id);
      if (!channel) continue;
      items.push({
        channelId: id,
        standardName: channel.standardName,
        currentLifecycle: channel.lifecycle ?? "active",
        targetLifecycle: input.target,
      });
    }
    return { items, count: items.length };
  }
}
