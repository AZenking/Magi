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
import { CanonicalChannelRepository } from "../../infrastructure/database/canonical-channel.repository";
import { ChannelStreamRepository } from "../../infrastructure/database/channel-stream.repository";

export class CanonicalChannelMemberWriter implements IManualMembershipWriter {
  private readonly channels = new ChannelRepository();
  private readonly members = new CanonicalChannelMemberRepository();
  private readonly canonicals = new CanonicalChannelRepository();
  private readonly streams = new ChannelStreamRepository();

  async upsertManualMembership(
    canonicalChannelId: string,
    sourceChannelId: string,
    /** The use case passes "" — resolve the real identity from the source row. */
    channelIdentity: string,
  ): Promise<void> {
    const canonical = await this.canonicals.findById(canonicalChannelId);
    if (!canonical) {
      throw new Error(`Canonical channel not found: ${canonicalChannelId}`);
    }

    const source = await this.channels.findById(sourceChannelId);
    if (!source) {
      throw new Error(`Source channel not found: ${sourceChannelId}`);
    }

    // Resolve the stable channel identity if the caller didn't provide one.
    let identity = channelIdentity;
    if (!identity) {
      identity = source.channelIdentity;
    }

    const sourceStreams =
      await this.streams.findBySourceChannelId(sourceChannelId);
    const existingSourceStream = sourceStreams[0];
    const previousCanonicalId = existingSourceStream?.canonicalChannelId;
    const wasPrimary = existingSourceStream?.isPrimary === true;
    const targetStreams =
      await this.streams.findByCanonicalChannelId(canonicalChannelId);

    const existingMemberships =
      await this.members.findBySourceChannelId(sourceChannelId);
    for (const membership of existingMemberships) {
      if (
        membership.active &&
        membership.canonicalChannelId !== canonicalChannelId
      ) {
        await this.members.deactivate(
          membership.canonicalChannelId,
          sourceChannelId,
        );
      }
    }

    await this.members.upsert({
      canonicalChannelId,
      sourceChannelId,
      channelIdentity: identity,
      membershipSource: "manual",
    });

    // A candidate is created before a canonical exists for weak matches, so
    // accepting it must also materialize the source-derived line. Otherwise
    // the new membership is invisible to M3U output until a later sync.
    if (source.streamUrl) {
      const sourcePresent =
        source.sourcePresence === undefined ||
        source.sourcePresence === "present";
      const existing = existingSourceStream;
      if (existing) {
        await this.streams.update(existing.id, {
          canonicalChannelId,
          m3uSourceId: source.m3uSourceId,
          streamUrl: source.streamUrl,
          sourceChannelId,
          origin: "source",
          missingSince: sourcePresent
            ? null
            : (existing.missingSince ?? new Date()),
          purgedAt: sourcePresent ? null : existing.purgedAt,
          isPrimary:
            previousCanonicalId === canonicalChannelId
              ? existing.isPrimary
              : targetStreams.length === 0,
        });

        // A moved primary cannot leave the old canonical pointing at a
        // stream that no longer belongs to it. Promote the next ordered line
        // there, and make the moved stream primary when the target was empty.
        if (
          previousCanonicalId &&
          previousCanonicalId !== canonicalChannelId &&
          wasPrimary
        ) {
          const remaining = (
            await this.streams.findByCanonicalChannelId(previousCanonicalId)
          )
            .filter((stream) => stream.id !== existing.id)
            .sort(
              (a, b) =>
                (a.position ?? Number.MAX_SAFE_INTEGER) -
                (b.position ?? Number.MAX_SAFE_INTEGER),
            );
          const fallback = remaining[0];
          if (fallback && !fallback.isPrimary) {
            await this.streams.update(fallback.id, { isPrimary: true });
          }
          await this.canonicals.update(previousCanonicalId, {
            primaryStreamId: fallback?.id ?? null,
          });
        }
        if (
          previousCanonicalId !== canonicalChannelId &&
          targetStreams.length === 0
        ) {
          await this.canonicals.update(canonicalChannelId, {
            primaryStreamId: existing.id,
          });
        } else if (
          previousCanonicalId !== canonicalChannelId &&
          targetStreams.length > 0
        ) {
          const targetPrimary =
            targetStreams.find((stream) => stream.isPrimary) ??
            targetStreams[0];
          if (targetPrimary && !targetPrimary.isPrimary) {
            await this.streams.update(targetPrimary.id, { isPrimary: true });
          }
          if (targetPrimary && canonical.primaryStreamId !== targetPrimary.id) {
            await this.canonicals.update(canonicalChannelId, {
              primaryStreamId: targetPrimary.id,
            });
          }
        }
      } else {
        const created = await this.streams.create({
          canonicalChannelId,
          m3uSourceId: source.m3uSourceId,
          rawChannelId: source.rawChannelId,
          sourceChannelId,
          streamUrl: source.streamUrl,
          isPrimary: targetStreams.length === 0,
          healthStatus: "unknown",
          responseTime: null,
          lastCheckedAt: null,
          lastSuccessAt: null,
          consecutiveFailures: 0,
          successRate: null,
          streamError: null,
          streamCodec: null,
          streamFormat: null,
          streamWidth: null,
          streamHeight: null,
          streamFrameRate: null,
          streamBitrate: null,
          origin: "source",
          position: targetStreams.length,
          eligibleForFailover: true,
          missingSince: sourcePresent ? null : new Date(),
          purgedAt: null,
          consecutiveSuccesses: 0,
          failingSince: null,
          cooldownUntil: null,
          version: 1,
        });
        if (targetStreams.length === 0) {
          await this.canonicals.update(canonicalChannelId, {
            primaryStreamId: created.id,
          });
        }
      }
    }
  }
}
