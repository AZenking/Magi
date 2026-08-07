/**
 * Merge candidate review use cases (009-m3u-control-plane T026).
 *
 * Wires the IMergeCandidateRepository to operator-facing actions:
 *   - List pending candidates with optional status / method filters
 *   - Accept: creates a manual canonical-channel-member relationship
 *   - Reject: records suppression so the same pairing doesn't re-appear
 *
 * Accept delegates membership creation to a separate port so this use case
 * stays focused on candidate state. The manual membership write typically
 * reuses `ICanonicalReconcileRepository.upsertMembership(_, _, "manual")`.
 */
import type { MergeCandidateVo } from "@magi/types";
import type {
  IMergeCandidateRepository,
  MergeCandidateFilters,
} from "@/domain/output-composition";

export interface ListMergeCandidatesInput {
  readonly filters?: MergeCandidateFilters;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListMergeCandidatesResult {
  readonly items: readonly MergeCandidateVo[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ReviewMergeCandidateInput {
  readonly id: string;
  readonly decision: "accept" | "reject";
  readonly canonicalChannelId?: string;
  readonly reason?: string;
  readonly reviewedBy: string;
}

export interface ReviewMergeCandidateResult {
  readonly candidate: MergeCandidateVo;
  /** Present when accept created a manual membership. */
  readonly membershipCreated: boolean;
}

export interface IManualMembershipWriter {
  /** Create or reactivate a manual membership link. */
  upsertManualMembership(
    canonicalChannelId: string,
    sourceChannelId: string,
    channelIdentity: string,
  ): Promise<void>;
}

export class ListMergeCandidatesUseCase {
  constructor(private readonly repo: IMergeCandidateRepository) {}

  async execute(
    input: ListMergeCandidatesInput = {},
  ): Promise<ListMergeCandidatesResult> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const result = await this.repo.list(input.filters ?? {}, { page, pageSize });
    return {
      items: result.items,
      total: result.total,
      page,
      pageSize,
    };
  }
}

export class ReviewMergeCandidateUseCase {
  constructor(
    private readonly repo: IMergeCandidateRepository,
    private readonly manualWriter: IManualMembershipWriter,
  ) {}

  async execute(input: ReviewMergeCandidateInput): Promise<ReviewMergeCandidateResult> {
    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new MergeCandidateNotFoundError(input.id);
    }
    if (existing.status !== "pending") {
      throw new MergeCandidateNotPendingError(input.id, existing.status);
    }

    let membershipCreated = false;
    if (input.decision === "accept") {
      const targetCanonical =
        input.canonicalChannelId ?? existing.canonicalChannelId;
      if (!targetCanonical) {
        throw new MergeCandidateValidationError(
          "accept requires a canonicalChannelId (existing or override)",
        );
      }
      await this.manualWriter.upsertManualMembership(
        targetCanonical,
        existing.sourceChannelId,
        // channelIdentity is unknown here; pass empty and let the writer
        // resolve it from the source channel row.
        "",
      );
      membershipCreated = true;
      const updated = await this.repo.markAccepted(
        input.id,
        input.reviewedBy,
        input.reason,
      );
      return { candidate: updated ?? existing, membershipCreated };
    }

    const rejected = await this.repo.markRejected(
      input.id,
      input.reviewedBy,
      input.reason,
    );
    return { candidate: rejected ?? existing, membershipCreated };
  }
}

export class MergeCandidateNotFoundError extends Error {
  constructor(public readonly candidateId: string) {
    super(`Merge candidate not found: ${candidateId}`);
    this.name = "MergeCandidateNotFoundError";
  }
}

export class MergeCandidateNotPendingError extends Error {
  constructor(
    public readonly candidateId: string,
    public readonly currentStatus: string,
  ) {
    super(`Merge candidate ${candidateId} is ${currentStatus}, not pending`);
    this.name = "MergeCandidateNotPendingError";
  }
}

export class MergeCandidateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeCandidateValidationError";
  }
}
