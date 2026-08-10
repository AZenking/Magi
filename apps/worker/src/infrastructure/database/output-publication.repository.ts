/**
 * Worker-side output publication projection.
 *
 * The playlist is generated dynamically, but management still needs a durable
 * answer for "what was last published and why is it stale/blocked?". Keep the
 * projection update next to the apply/reconcile boundary so a successful M3U
 * operation cannot report applied while the publication row remains empty.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  canonicalChannels,
  channelStreams,
  m3uSources,
  outputPublications,
} from "../../schema";

export async function refreshOutputPublication(input: {
  readonly changeSetId: string | null;
  readonly status: "fresh" | "stale" | "blocked";
  readonly blockingReason: string | null;
}): Promise<void> {
  const visibleRows = await db
    .select({ id: canonicalChannels.id })
    .from(canonicalChannels)
    .where(
      and(
        or(
          eq(canonicalChannels.lifecycle, "active"),
          isNull(canonicalChannels.lifecycle),
        ),
        eq(canonicalChannels.hidden, false),
        eq(canonicalChannels.disabled, false),
      ),
    );
  const visibleIds = visibleRows.map((row) => row.id);
  const streams =
    visibleIds.length === 0
      ? []
      : await db
          .select({
            canonicalChannelId: channelStreams.canonicalChannelId,
            origin: channelStreams.origin,
            missingSince: channelStreams.missingSince,
            purgedAt: channelStreams.purgedAt,
            healthStatus: channelStreams.healthStatus,
            eligibleForFailover: channelStreams.eligibleForFailover,
            sourceParticipateInOutput: m3uSources.participateInOutput,
          })
          .from(channelStreams)
          .leftJoin(m3uSources, eq(channelStreams.m3uSourceId, m3uSources.id))
          .where(inArray(channelStreams.canonicalChannelId, [...visibleIds]));
  const playableIds = new Set<string>();
  for (const stream of streams) {
    const sourceAllowed = stream.sourceParticipateInOutput !== false;
    const present =
      stream.origin === "manual" ||
      (stream.missingSince == null && stream.purgedAt == null);
    const healthy =
      stream.healthStatus === "online" || stream.healthStatus === "unknown";
    if (
      sourceAllowed &&
      present &&
      healthy &&
      stream.eligibleForFailover !== false
    ) {
      playableIds.add(stream.canonicalChannelId);
    }
  }

  const now = new Date();
  const effectiveStatus =
    input.status === "fresh" && playableIds.size === 0
      ? "blocked"
      : input.status;
  const publishedAt = effectiveStatus === "fresh" ? now : null;
  const effectiveBlockingReason =
    effectiveStatus === "blocked" && input.blockingReason == null
      ? "no-playable-channels"
      : input.blockingReason;
  const values = {
    scope: "primary",
    revision: `${now.getTime()}-${input.changeSetId ?? "system"}`.slice(0, 80),
    status: effectiveStatus,
    publishedAt,
    channelCount: visibleIds.length,
    playableChannelCount: playableIds.size,
    excludedChannelCount: Math.max(0, visibleIds.length - playableIds.size),
    blockingReason: effectiveBlockingReason,
    lastApplyChangeSetId: input.changeSetId,
    updatedAt: now,
  };
  await db
    .insert(outputPublications)
    .values(values)
    .onConflictDoUpdate({
      target: outputPublications.scope,
      set: {
        revision: values.revision,
        status: values.status,
        publishedAt:
          effectiveStatus === "fresh"
            ? now
            : sql`${outputPublications.publishedAt}`,
        channelCount: values.channelCount,
        playableChannelCount: values.playableChannelCount,
        excludedChannelCount: values.excludedChannelCount,
        blockingReason: values.blockingReason,
        lastApplyChangeSetId: values.lastApplyChangeSetId,
        updatedAt: now,
      },
    });
}
