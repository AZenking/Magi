import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import type { ICanonicalChannelRepository, IChannelOverrideRepository, CanonicalChannel } from "@/domain/output-composition";
import type { UpdateOutputChannel } from "@magi/types";

@Injectable()
export class UpdateOutputChannelUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_OVERRIDE_REPOSITORY")
    private readonly overrideRepo: IChannelOverrideRepository,
  ) {}

  async execute(id: string, data: UpdateOutputChannel): Promise<CanonicalChannel> {
    const canonical = await this.canonicalRepo.findById(id);
    if (!canonical) throw new NotFoundException("Channel not found");

    const rawChannelId = canonical.mergedFromIds;
    if (!rawChannelId) throw new BadRequestException("Channel has no underlying raw channel");

    const overrideData: Record<string, unknown> = {};
    const canonicalUpdate: Partial<CanonicalChannel> = {};

    if (data.standardName !== undefined) {
      overrideData.customName = data.standardName;
      canonicalUpdate.standardName = data.standardName ?? canonical.standardName;
    }
    if (data.standardGroup !== undefined) {
      overrideData.customGroup = data.standardGroup;
      canonicalUpdate.standardGroup = data.standardGroup;
    }
    if (data.standardLogo !== undefined) {
      overrideData.customLogo = data.standardLogo;
      canonicalUpdate.standardLogo = data.standardLogo;
    }
    if (data.channelNumber !== undefined) {
      overrideData.channelNumber = data.channelNumber;
      canonicalUpdate.channelNumber = data.channelNumber;
    }
    if (data.hidden !== undefined) {
      overrideData.hidden = data.hidden;
      canonicalUpdate.hidden = data.hidden;
    }
    if (data.starred !== undefined) {
      overrideData.starred = data.starred;
      canonicalUpdate.starred = data.starred;
    }
    if (data.epgChannelId !== undefined) {
      overrideData.manualEpgChannelId = data.epgChannelId;
      canonicalUpdate.epgChannelId = data.epgChannelId;
      if (data.epgChannelId) {
        canonicalUpdate.epgMatchType = "manual";
        canonicalUpdate.epgStatus = "matched_manual";
      } else {
        canonicalUpdate.epgMatchType = null;
        canonicalUpdate.epgStatus = "unmatched";
      }
    }

    await this.overrideRepo.upsert(rawChannelId, overrideData);

    const updated = await this.canonicalRepo.update(id, canonicalUpdate);
    if (!updated) throw new NotFoundException("Channel not found");
    return updated;
  }
}
