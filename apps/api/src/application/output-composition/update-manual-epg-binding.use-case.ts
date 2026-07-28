/**
 * UpdateManualEpgBindingUseCase (T069).
 *
 * Records a manual EPG binding on a canonical channel: source, lock, reason,
 * version (optimistic). Locked bindings survive automatic matching (FR-005,
 * contracts/channels.md PATCH /output/channels/{id}/epg-binding).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import type {
  CanonicalEpgBinding,
  ICanonicalChannelRepository,
  ICanonicalEpgBindingRepository,
} from "@/domain/output-composition";
import type { IRawXmltvChannelRepository } from "@/domain/channel-catalog";

export interface UpdateManualEpgBindingInput {
  readonly channelId: string;
  readonly xmltvSourceId: string | null;
  readonly epgChannelId: string | null;
  readonly locked: boolean;
  readonly reason?: string;
  readonly expectedVersion: number;
}

export class UpdateManualEpgBindingUseCase {
  constructor(
    private readonly bindingRepo: ICanonicalEpgBindingRepository,
    private readonly canonicalRepo: ICanonicalChannelRepository,
    private readonly rawXmltvRepo: IRawXmltvChannelRepository,
  ) {}

  async execute(input: UpdateManualEpgBindingInput): Promise<CanonicalEpgBinding> {
    // Clearing binding: null IDs + locked=false.
    if (!input.epgChannelId && input.locked) {
      throw new ConflictException({
        code: "validation-failed",
        title: "Cannot lock an empty binding",
        status: 422,
      });
    }

    const canonical = await this.canonicalRepo.findById(input.channelId);
    if (!canonical) throw new NotFoundException("Channel not found");

    if (!!input.xmltvSourceId !== !!input.epgChannelId) {
      throw new ConflictException({
        code: "validation-failed",
        title: "XMLTV source and channel must be provided together",
        status: 422,
      });
    }

    if (input.xmltvSourceId && input.epgChannelId) {
      const candidate = await this.rawXmltvRepo.findBySourceAndXmltvId(
        input.xmltvSourceId,
        input.epgChannelId,
      );
      if (!candidate) {
        throw new ConflictException({
          code: "epg-candidate-not-found",
          title: "EPG channel does not belong to the selected XMLTV source",
          status: 422,
        });
      }
    }

    const status = input.epgChannelId ? "matched_manual" : "unmatched";
    const binding = await this.bindingRepo.upsert(
      input.channelId,
      {
        xmltvSourceId: input.xmltvSourceId,
        xmltvChannelId: input.epgChannelId,
        status,
        matchType: input.epgChannelId ? "manual" : null,
        locked: input.locked,
        decisionReason: input.reason ?? null,
      },
      input.expectedVersion,
    );
    if (!binding) {
      throw new ConflictException({
        code: "version-conflict",
        title: "EPG binding was modified by another request",
        status: 409,
      });
    }

    await this.canonicalRepo.update(input.channelId, {
      epgChannelId: input.epgChannelId,
      epgMatchType: input.epgChannelId ? "manual" : null,
      epgStatus: status,
    });

    return binding;
  }
}
