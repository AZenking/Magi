import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ICanonicalChannelRepository, IChannelOverrideRepository, CanonicalChannel } from "@/domain/output-composition";
import type { IChannelRepository } from "@/domain/channel-catalog";
import type { UpdateOutputChannel } from "@magi/types";

@Injectable()
export class UpdateOutputChannelUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    @Inject("CHANNEL_OVERRIDE_REPOSITORY")
    private readonly overrideRepo: IChannelOverrideRepository,
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
  ) {}

  async execute(id: string, data: UpdateOutputChannel): Promise<CanonicalChannel> {
    const canonical = await this.canonicalRepo.findById(id);
    if (!canonical) throw new NotFoundException("Channel not found");

    // Find a valid channel ID for the override (may be null for EPG-only updates)
    const rawChannelId = await this.resolveOverrideChannelId(canonical.mergedFromIds);

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

    // Write override row only if we have a valid raw channel
    if (rawChannelId) {
      await this.overrideRepo.upsert(rawChannelId, overrideData);
    }

    const updated = await this.canonicalRepo.update(id, canonicalUpdate);
    if (!updated) throw new NotFoundException("Channel not found");
    return updated;
  }

  async batchUpdate(ids: string[], data: Partial<CanonicalChannel>): Promise<number> {
    return this.canonicalRepo.batchUpdate(ids, data);
  }

  async batchDelete(ids: string[]): Promise<number> {
    return this.canonicalRepo.batchDelete(ids);
  }

  private async resolveOverrideChannelId(mergedFromIds: string | null): Promise<string | null> {
    if (!mergedFromIds) return null;
    let identities: string[];
    try {
      const parsed = JSON.parse(mergedFromIds);
      identities = Array.isArray(parsed) ? parsed : [mergedFromIds];
    } catch {
      identities = [mergedFromIds];
    }

    // Resolve each identity to a current channel row
    // New format: channelIdentity strings; legacy: UUID strings
    const resolvedChannels: { id: string; identity: string }[] = [];
    for (const id of identities) {
      // Try as channelIdentity first (new format)
      const byIdentity = await this.channelRepo.findByIdentity(id);
      if (byIdentity) {
        resolvedChannels.push({ id: byIdentity.id, identity: id });
        continue;
      }
      // Fallback: try as old UUID (legacy format)
      const byId = await this.channelRepo.findById(id);
      if (byId) {
        resolvedChannels.push({ id: byId.id, identity: byId.channelIdentity });
      }
    }
    if (resolvedChannels.length === 0) return null;

    // Prefer the channel that already has an override (reuse the same row)
    for (const rc of resolvedChannels) {
      const existing = await this.overrideRepo.findByChannelId(rc.id);
      if (existing) return rc.id;
    }

    return resolvedChannels[0]!.id;
  }
}
