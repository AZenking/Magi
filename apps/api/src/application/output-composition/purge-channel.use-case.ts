/**
 * PurgeChannelUseCase (T055).
 *
 * Permanent purge — a separate high-risk operation, not a lifecycle transition.
 * Refuses if the channel is not trashed or purgeAfter hasn't elapsed (FR-016).
 * The preview names every relationship that becomes unrecoverable.
 */
import { ConflictException } from "@nestjs/common";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import { CanonicalChannelModel } from "@/domain/output-composition";

export interface PurgePreviewInput {
  readonly channelId: string;
}

export interface PurgePreview {
  readonly channelId: string;
  readonly standardName: string;
  readonly canPurge: boolean;
  readonly reason: string;
  readonly unrecoverableRelationships: string[];
}

export class PurgeChannelUseCase {
  constructor(private readonly canonicalRepo: ICanonicalChannelRepository) {}

  async preview(input: PurgePreviewInput): Promise<PurgePreview> {
    const channel = await this.canonicalRepo.findById(input.channelId);
    if (!channel) throw new ConflictException({ code: "resource-not-found", status: 404 });
    const model = new CanonicalChannelModel(channel);
    const canPurge = model.canPurge();
    return {
      channelId: channel.id,
      standardName: channel.standardName,
      canPurge,
      reason: canPurge ? "Eligible" : `Not eligible: lifecycle=${model.lifecycleState()}, purgeAfter=${channel.purgeAfter?.toISOString() ?? "null"}`,
      unrecoverableRelationships: [
        "频道配置（名称、分组、Logo、台号）",
        "EPG 绑定",
        "线路集合与健康历史",
        "来源成员关系",
      ],
    };
  }

  async apply(channelId: string): Promise<{ purged: boolean }> {
    const preview = await this.preview({ channelId });
    if (!preview.canPurge) {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: "Channel cannot be purged yet",
        status: 409,
      });
    }
    // Hard delete via batchDelete (no recovery).
    await this.canonicalRepo.batchDelete([channelId]);
    return { purged: true };
  }
}
