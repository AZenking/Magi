/**
 * ChangeChannelLifecycleUseCase (T055).
 *
 * Single-channel reversible lifecycle transition with If-Match (contracts/
 * channels.md POST /output/channels/{id}/lifecycle).
 */
import { ConflictException } from "@nestjs/common";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import type { ChannelLifecycle } from "@/domain/output-composition";
import { CanonicalChannelModel } from "@/domain/output-composition";

export interface ChangeLifecycleInput {
  readonly channelId: string;
  readonly target: ChannelLifecycle;
  readonly reason?: string;
  readonly expectedVersion: number;
}

export class ChangeChannelLifecycleUseCase {
  constructor(private readonly canonicalRepo: ICanonicalChannelRepository) {}

  async execute(input: ChangeLifecycleInput): Promise<{
    previous: ChannelLifecycle;
    version: number;
    lifecycle: ChannelLifecycle;
    purgeAfter: Date | null;
    changedAt: Date;
  }> {
    const channel = await this.canonicalRepo.findById(input.channelId);
    if (!channel) throw new ConflictException({ code: "resource-not-found", status: 404 });

    const model = new CanonicalChannelModel(channel);
    if (!model.canTransitionTo(input.target)) {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `Cannot transition from ${model.lifecycleState()} to ${input.target}`,
        status: 409,
      });
    }

    const previous = model.lifecycleState();
    const purgeAfter = input.target === "trashed"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;
    // Restoring out of trash clears trashedAt (contracts/channels.md restore).
    const trashedAt = input.target === "trashed"
      ? new Date()
      : previous === "trashed"
        ? null
        : channel.trashedAt ?? null;

    const updated = await this.canonicalRepo.updateIfVersion(input.channelId, {
      lifecycle: input.target,
      lifecycleReason: input.reason ?? null,
      trashedAt,
      purgeAfter,
      // Keep compatibility booleans in sync during transition.
      hidden: input.target === "hidden",
      disabled: input.target === "disabled",
    }, input.expectedVersion);

    if (!updated) {
      throw new ConflictException({
        code: "stale-resource",
        status: 412,
        currentVersion: channel.version,
      });
    }

    return {
      previous,
      version: updated.version ?? input.expectedVersion + 1,
      lifecycle: input.target,
      purgeAfter,
      changedAt: new Date(),
    };
  }
}
