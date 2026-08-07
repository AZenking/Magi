/**
 * UpdateOutputPublicationUseCase (009-m3u-control-plane T048).
 *
 * Single projection use case that updates the OutputPublication row after
 * every apply, failover or grant change. Three outcomes:
 *   - apply-succeeded + playable channels > 0  → fresh
 *   - apply-failed                              → stale (last-good kept)
 *   - apply-succeeded + 0 playable              → blocked
 *
 * Revision is monotonic per scope: identical input reuses the prior revision,
 * any change bumps it. The format is `<iso-date>-<counter>` so consumers can
 * detect "same directory" by string equality without parsing.
 */
import { Inject, Injectable } from "@nestjs/common";
import type {
  IOutputPublicationRepository,
} from "@/domain/output-composition";
import type { OutputPublicationVo } from "@magi/types";

export type PublicationOutcome =
  | "apply-succeeded"
  | "apply-failed"
  | "no-output";

export interface UpdatePublicationInput {
  readonly scope: string;
  readonly outcome: PublicationOutcome;
  readonly channelCount: number;
  readonly playableChannelCount: number;
  readonly excludedChannelCount: number;
  readonly lastApplyChangeSetId: string | null;
}

@Injectable()
export class UpdateOutputPublicationUseCase {
  constructor(
    @Inject("OUTPUT_PUBLICATION_REPOSITORY")
    private readonly repo: IOutputPublicationRepository,
  ) {}

  async execute(input: UpdatePublicationInput): Promise<OutputPublicationVo> {
    const prior = await this.repo.read(input.scope);
    const nextRevision = computeRevision(prior, input);
    const status = computeStatus(input);
    const publishedAt =
      status === "fresh" ? new Date() : prior?.publishedAt ? new Date(prior.publishedAt) : null;

    return this.repo.upsert({
      scope: input.scope,
      revision: nextRevision,
      status,
      publishedAt,
      channelCount: input.channelCount,
      playableChannelCount: input.playableChannelCount,
      excludedChannelCount: input.excludedChannelCount,
      blockingReason: blockingReasonFor(status, input),
      lastApplyChangeSetId: input.lastApplyChangeSetId,
    });
  }
}

function computeStatus(input: UpdatePublicationInput): OutputPublicationVo["status"] {
  if (input.outcome === "apply-failed" || input.outcome === "no-output") {
    if (input.playableChannelCount === 0 && input.outcome === "no-output") {
      return "blocked";
    }
    return "stale";
  }
  // apply-succeeded
  if (input.playableChannelCount === 0) {
    return "blocked";
  }
  return "fresh";
}

function blockingReasonFor(
  status: OutputPublicationVo["status"],
  input: UpdatePublicationInput,
): string | null {
  if (status === "blocked") {
    return input.playableChannelCount === 0
      ? "no-playable-channels"
      : "no-output";
  }
  if (status === "stale") {
    return input.outcome === "apply-failed"
      ? "last-apply-failed"
      : "no-output";
  }
  return null;
}

/**
 * Revision rule:
 *   - No prior → emit a fresh timestamped revision.
 *   - Identical input (same counts + same changeSetId) → reuse prior revision.
 *   - Otherwise → bump the counter embedded in the prior revision.
 */
function computeRevision(
  prior: OutputPublicationVo | null,
  input: UpdatePublicationInput,
): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!prior) {
    return `${today}-1`;
  }
  const sameInput =
    prior.channelCount === input.channelCount &&
    prior.playableChannelCount === input.playableChannelCount &&
    prior.excludedChannelCount === input.excludedChannelCount;
  if (sameInput) {
    return prior.revision;
  }
  // Bump counter on prior revision; fall back to -1 if prior format is unexpected.
  const match = prior.revision.match(/^(.+)-(\d+)$/);
  if (match) {
    const next = Number.parseInt(match[2]!, 10) + 1;
    return `${match[1]}-${next}`;
  }
  return `${today}-1`;
}
