/**
 * CanonicalChannelMemberWriter (009-m3u-control-plane spec compliance fix).
 *
 * Real implementation of IManualMembershipWriter. When a merge candidate is
 * accepted, resolves the source channel's channelIdentity from the `channels`
 * table (the use case only has the UUID), then upserts a manual membership
 * via CanonicalChannelMemberRepository.
 *
 * Replaces the previous no-op stub in output.controller.ts (FR-005/FR-007).
 */
import type { IManualMembershipWriter } from "./merge-candidate.use-cases";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { CanonicalChannelMemberRepository } from "../../infrastructure/database/canonical-channel-member.repository";

export class CanonicalChannelMemberWriter implements IManualMembershipWriter {
  private readonly channels = new ChannelRepository();
  private readonly members = new CanonicalChannelMemberRepository();

  async upsertManualMembership(
    canonicalChannelId: string,
    sourceChannelId: string,
    /** The use case passes "" — resolve the real identity from the source row. */
    channelIdentity: string,
  ): Promise<void> {
    // Resolve the stable channel identity if the caller didn't provide one.
    let identity = channelIdentity;
    if (!identity) {
      const source = await this.channels.findById(sourceChannelId);
      identity = source?.channelIdentity ?? sourceChannelId;
    }

    await this.members.upsert({
      canonicalChannelId,
      sourceChannelId,
      channelIdentity: identity,
      membershipSource: "manual",
    });
  }
}
