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
    const sourceChannels = input.sourceChannels ?? [];
    const legacyIds = input.sourceChannelIds ?? [];
    const missingSourceChannelIds = input.missingSourceChannelIds;

    let linkedCount = 0;
    let createdCount = 0;
    let candidatesEmitted = 0;
    let candidatesSuppressed = 0;

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

    const processedSourceIds = new Set<string>();
    let i = 0;
    for (const [normalizedTvgId, group] of groups) {
      const existing = await this.repo.findCanonicalByNormalizedTvgId(normalizedTvgId);
      let canonicalChannelId: string;
      if (existing) {
        canonicalChannelId = existing.canonicalChannelId;
      } else {
        const displayName = group[0]?.displayName ?? normalizedTvgId;
        const created = await this.repo.createCanonicalFromSource(
          group[0]!.sourceChannelId,
          displayName,
        );
        canonicalChannelId = created.canonicalChannelId;
        createdCount++;
      }

      for (const ch of group) {
        const alreadyMember = await this.repo.findMembership(ch.sourceChannelId);
        if (!alreadyMember) {
          await this.repo.upsertMembership(
            canonicalChannelId,
            {
              sourceChannelId: ch.sourceChannelId,
              channelIdentity: ch.channelIdentity,
            },
            "automatic",
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
        linkedCount++;
        continue;
      }
      const created = await this.repo.createCanonicalFromSource(
        sourceChannelId,
        sourceChannelId,
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
        const suppressed = await this.repo.isCandidateSuppressed(suppressionKey);
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
        await this.repo.deactivateMembership(membership.canonicalChannelId, missingId);
        deactivatedCount++;
      }
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
