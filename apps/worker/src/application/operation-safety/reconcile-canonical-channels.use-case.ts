/**
 * ReconcileCanonicalChannelsUseCase (T038; 009-m3u-control-plane T025 rewrites
 * the merge logic to use same-tvg-id-only auto-merge + weak-match candidates
 * instead of the legacy weak-name merge-key approach).
 *
 * Incremental reconciliation linking source channels to canonical channels via
 * stable membership:
 *   1. Same non-null normalized tvg-id → auto-merge into one canonical.
 *   2. No tvg-id but name/group matches an existing canonical → emit a
 *      weak-match candidate (no silent merge).
 *   3. Reject-suppressed pairings never re-emit a candidate.
 *   4. Missing source channels have their membership deactivated.
 *
 * Preserves override, lifecycle, manual streams, primary stream and health
 * history — never deletes or regenerates canonical IDs (research §3, FR-004,
 * FR-007).
 *
 * Depends only on domain ports + pure helpers (constitution III).
 */
import {
  groupByNormalizedTvgId,
  generateWeakMatchCandidates,
  buildCandidateSuppressionKey,
} from "@magi/backend-core";
import type {
  ICanonicalReconcileRepository,
  ReconcileSourceChannelInput,
} from "@/domain/source-sync/canonical-reconcile.repository";

export interface ReconcileInput {
  readonly sourceId: string;
  /** Full source-channel payloads (009 T025: needed for tvg-id/name/group). */
  readonly sourceChannels?: readonly ReconcileSourceChannelInput[];
  /** Legacy callers may pass just IDs; the use case deactivates missing for those. */
  readonly sourceChannelIds?: readonly string[];
  readonly missingSourceChannelIds: readonly string[];
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface ReconcileResult {
  readonly linkedCount: number;
  readonly createdCount: number;
  readonly deactivatedCount: number;
  /** 009: weak-match candidates emitted for operator review. */
  readonly candidatesEmitted: number;
  /** 009: candidates skipped because the pairing was previously rejected. */
  readonly candidatesSuppressed: number;
}

export class ReconcileCanonicalChannelsUseCase {
  constructor(private readonly repo: ICanonicalReconcileRepository) {}

  async execute(input: ReconcileInput): Promise<ReconcileResult> {
    if (this.repo.runInTransaction) {
      return this.repo.runInTransaction((repo) =>
        new ReconcileCanonicalChannelsUseCase(repo).executeCore(input),
      );
    }
    return this.executeCore(input);
  }

  private async executeCore(input: ReconcileInput): Promise<ReconcileResult> {
    const sourceChannels = input.sourceChannels ?? [];
    const sourceById = new Map(
      sourceChannels.map((source) => [source.sourceChannelId, source]),
    );
    const legacyIds = input.sourceChannelIds ?? [];
    const missingSourceChannelIds = input.missingSourceChannelIds;

    await this.repo.markStaleCandidates?.([
      ...sourceChannels.map((source) => ({
        sourceChannelId: source.sourceChannelId,
        sourceFingerprint: source.sourceFingerprint,
      })),
      ...missingSourceChannelIds.map((sourceChannelId) => ({
        sourceChannelId,
        sourceFingerprint: null,
      })),
    ]);

    let linkedCount = 0;
    let createdCount = 0;
    let candidatesEmitted = 0;
    let candidatesSuppressed = 0;

    // Re-link a source channel to its prior canonical before considering any
    // new merge. This is what makes a 30-day missing/reappearing line reuse
    // the original membership and canonical identity (including tvg-id-null
    // channels and manual memberships).
    const processedSourceIds = new Set<string>();
    for (const ch of sourceChannels) {
      const existing = await this.repo.findMembership(ch.sourceChannelId);
      if (!existing) continue;
      const source =
        existing.membershipSource === "manual" ? "manual" : "automatic";
      if (existing.active === false) {
        await this.repo.upsertMembership(
          existing.canonicalChannelId,
          {
            sourceChannelId: ch.sourceChannelId,
            channelIdentity: ch.channelIdentity,
          },
          source,
        );
      }
      if (ch.streamUrl) {
        await this.repo.upsertSourceStream(
          existing.canonicalChannelId,
          ch.sourceChannelId,
          input.sourceId,
          ch.streamUrl,
        );
      } else {
        await this.repo.markSourceStreamMissing(ch.sourceChannelId, new Date());
      }
      processedSourceIds.add(ch.sourceChannelId);
      linkedCount++;
    }

    // ----- 1. Auto-merge by same non-null normalized tvg-id -----
    const groups = groupByNormalizedTvgId(
      sourceChannels.map((c) => ({
        sourceChannelId: c.sourceChannelId,
        channelIdentity: c.channelIdentity,
        tvgId: c.tvgId,
        tvgName: null,
        displayName: c.displayName,
        groupTitle: c.groupTitle,
        sourceFingerprint: c.sourceFingerprint,
      })),
    );

    let i = 0;
    for (const [normalizedTvgId, group] of groups) {
      const pendingGroup = group.filter(
        (ch) => !processedSourceIds.has(ch.sourceChannelId),
      );
      if (pendingGroup.length === 0) continue;
      const existing =
        await this.repo.findCanonicalByNormalizedTvgId(normalizedTvgId);
      let canonicalChannelId: string;
      if (existing) {
        canonicalChannelId = existing.canonicalChannelId;
      } else {
        const displayName = pendingGroup[0]?.displayName ?? normalizedTvgId;
        const created = await this.repo.createCanonicalFromSource(
          pendingGroup[0]!.sourceChannelId,
          displayName,
          pendingGroup[0]!.groupTitle,
        );
        canonicalChannelId = created.canonicalChannelId;
        createdCount++;
      }

      for (const ch of pendingGroup) {
        const alreadyMember = await this.repo.findMembership(
          ch.sourceChannelId,
        );
        const targetCanonicalId =
          alreadyMember?.canonicalChannelId ?? canonicalChannelId;
        if (!alreadyMember) {
          await this.repo.upsertMembership(
            targetCanonicalId,
            {
              sourceChannelId: ch.sourceChannelId,
              channelIdentity: ch.channelIdentity,
            },
            "automatic",
          );
        }
        const streamUrl = sourceById.get(ch.sourceChannelId)?.streamUrl;
        if (streamUrl) {
          await this.repo.upsertSourceStream(
            targetCanonicalId,
            ch.sourceChannelId,
            input.sourceId,
            streamUrl,
          );
        } else {
          // A source entry without a playable URL must not leave a stale
          // source-derived line visible in output. Keep the row for history
          // and retention, but mark it unavailable like a missing line.
          await this.repo.markSourceStreamMissing(
            ch.sourceChannelId,
            new Date(),
          );
        }
        linkedCount++;
        processedSourceIds.add(ch.sourceChannelId);
      }

      if (input.updateProgress && i % 50 === 0) {
        await input.updateProgress(
          Math.floor((i / Math.max(groups.size, 1)) * 60),
          "reconcile-auto-merge",
        );
      }
      i++;
    }

    // ----- 2. Legacy IDs that didn't come through the new payload path -----
    for (const sourceChannelId of legacyIds) {
      if (processedSourceIds.has(sourceChannelId)) continue;
      const alreadyMember = await this.repo.findMembership(sourceChannelId);
      if (alreadyMember) {
        if (alreadyMember.active === false) {
          await this.repo.upsertMembership(
            alreadyMember.canonicalChannelId,
            { sourceChannelId, channelIdentity: sourceChannelId },
            alreadyMember.membershipSource === "manual"
              ? "manual"
              : "automatic",
          );
        }
        linkedCount++;
        continue;
      }
      const created = await this.repo.createCanonicalFromSource(
        sourceChannelId,
        sourceChannelId,
        null,
      );
      await this.repo.upsertMembership(
        created.canonicalChannelId,
        { sourceChannelId, channelIdentity: sourceChannelId },
        "automatic",
      );
      createdCount++;
      linkedCount++;
    }

    // ----- 3. Weak-match candidates for unmatched source channels -----
    const unmatched = sourceChannels.filter(
      (c) => !processedSourceIds.has(c.sourceChannelId),
    );
    if (unmatched.length > 0) {
      const canonicals = await this.repo.listCanonicalsForWeakMatch();
      const candidates = generateWeakMatchCandidates({
        unmatchedSources: unmatched.map((c) => ({
          sourceChannelId: c.sourceChannelId,
          channelIdentity: c.channelIdentity,
          tvgId: c.tvgId,
          tvgName: null,
          displayName: c.displayName,
          groupTitle: c.groupTitle,
          sourceFingerprint: c.sourceFingerprint,
        })),
        canonicals: canonicals.map((c) => ({
          canonicalChannelId: c.canonicalChannelId,
          memberSourceChannelIds: new Set(c.memberSourceChannelIds),
          normalizedName: c.normalizedName,
          normalizedGroup: c.normalizedGroup,
        })),
      });

      for (const candidate of candidates) {
        const sourceFingerprint =
          unmatched.find((u) => u.sourceChannelId === candidate.sourceChannelId)
            ?.sourceFingerprint ?? "";
        const suppressionKey = buildCandidateSuppressionKey({
          sourceFingerprint,
          sourceChannelId: candidate.sourceChannelId,
          canonicalChannelId: candidate.canonicalChannelId,
          method: candidate.method,
        });
        const suppressed =
          await this.repo.isCandidateSuppressed(suppressionKey);
        if (suppressed) {
          candidatesSuppressed++;
          continue;
        }
        await this.repo.insertWeakMatchCandidate({
          sourceChannelId: candidate.sourceChannelId,
          canonicalChannelId: candidate.canonicalChannelId,
          method: candidate.method,
          reasons: candidate.reasons,
          sourceFingerprint,
          suppressionKey,
          confidence: candidate.confidence,
        });
        candidatesEmitted++;
      }
    }

    // ----- 4. Deactivate memberships for source channels that went missing -----
    let deactivatedCount = 0;
    for (const missingId of missingSourceChannelIds) {
      const membership = await this.repo.findMembership(missingId);
      if (membership) {
        await this.repo.deactivateMembership(
          membership.canonicalChannelId,
          missingId,
        );
        deactivatedCount++;
      }
      await this.repo.markSourceStreamMissing(missingId, new Date());
    }

    await input.updateProgress?.(100, "done");
    return {
      linkedCount,
      createdCount,
      deactivatedCount,
      candidatesEmitted,
      candidatesSuppressed,
    };
  }
}
