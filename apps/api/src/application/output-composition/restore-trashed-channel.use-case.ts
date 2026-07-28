/**
 * RestoreTrashedChannelUseCase (T055).
 *
 * Restores a trashed channel to a non-trashed state (active/hidden/disabled).
 * Clears trashedAt/purgeAfter. Requires If-Match.
 */
import { ConflictException } from "@nestjs/common";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";
import type { ChannelLifecycle } from "@/domain/output-composition";

export interface RestoreTrashedInput {
  readonly channelId: string;
  readonly target: ChannelLifecycle;
  readonly expectedVersion: number;
}

export class RestoreTrashedChannelUseCase {
  constructor(private readonly canonicalRepo: ICanonicalChannelRepository) {}

  async execute(input: RestoreTrashedInput): Promise<{ lifecycle: ChannelLifecycle }> {
    if (input.target === "trashed") {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: "Restore target cannot be trashed",
        status: 409,
      });
    }
    const updated = await this.canonicalRepo.updateIfVersion(
      input.channelId,
      {
        lifecycle: input.target,
        trashedAt: null,
        purgeAfter: null,
        hidden: input.target === "hidden",
        disabled: input.target === "disabled",
      },
      input.expectedVersion,
    );
    if (!updated) {
      throw new ConflictException({ code: "stale-resource", status: 412 });
    }
    return { lifecycle: input.target };
  }
}
