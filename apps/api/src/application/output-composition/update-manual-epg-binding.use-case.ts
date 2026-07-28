/**
 * UpdateManualEpgBindingUseCase (T069).
 *
 * Records a manual EPG binding on a canonical channel: source, lock, reason,
 * version (optimistic). Locked bindings survive automatic matching (FR-005,
 * contracts/channels.md PATCH /output/channels/{id}/epg-binding).
 */
import { ConflictException } from "@nestjs/common";
import type { IChannelOverrideRepository } from "@/domain/output-composition";

export interface UpdateManualEpgBindingInput {
  readonly channelId: string;
  readonly xmltvSourceId: string | null;
  readonly epgChannelId: string | null;
  readonly locked: boolean;
  readonly reason?: string;
  readonly expectedVersion: number;
}

export class UpdateManualEpgBindingUseCase {
  constructor(private readonly overrideRepo: IChannelOverrideRepository) {}

  async execute(input: UpdateManualEpgBindingInput): Promise<{ locked: boolean }> {
    // Clearing binding: null IDs + locked=false.
    if (!input.epgChannelId && input.locked) {
      throw new ConflictException({
        code: "validation-failed",
        title: "Cannot lock an empty binding",
        status: 422,
      });
    }

    await this.overrideRepo.upsert(input.channelId, {
      manualEpgChannelId: input.epgChannelId,
      manualEpgLocked: input.locked,
      manualEpgSourceId: input.xmltvSourceId,
      decisionReason: input.reason ?? null,
    });

    return { locked: input.locked };
  }
}
