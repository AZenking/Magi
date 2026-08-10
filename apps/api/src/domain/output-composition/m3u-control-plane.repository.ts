/**
 * M3U control-plane domain ports (T008, feature 009-m3u-control-plane).
 *
 * Repository contracts for the five new bounded contexts added by 009:
 *   - merge candidate review (weak-signal composition)
 *   - output grant lifecycle (per-player revocable access)
 *   - output publication projection
 *   - stream health observation (immutable evidence)
 *   - failover event audit log
 *
 * Implementations live in `apps/api/src/infrastructure/database/`. Use cases
 * in `apps/api/src/application/output-composition/` depend on these ports
 * only (constitution III).
 */
import type {
  MergeCandidateVo,
  OutputGrantSummaryVo,
  OutputPublicationVo,
  StreamHealthObservationVo,
  FailoverEventVo,
} from "@magi/types";

// ---------------------------------------------------------------------------
// Merge candidate review
// ---------------------------------------------------------------------------
export interface MergeCandidateFilters {
  readonly status?: MergeCandidateVo["status"];
  readonly method?: MergeCandidateVo["method"];
  readonly sourceChannelId?: string;
  readonly canonicalChannelId?: string;
}

export interface IMergeCandidateRepository {
  list(
    filters: MergeCandidateFilters,
    params: { page: number; pageSize: number },
  ): Promise<{ items: MergeCandidateVo[]; total: number }>;
  findById(id: string): Promise<MergeCandidateVo | null>;
  create(input: {
    sourceChannelId: string;
    canonicalChannelId: string | null;
    method: MergeCandidateVo["method"];
    reasons: readonly string[];
    sourceFingerprint: string;
    suppressionKey: string | null;
    confidence: number;
  }): Promise<MergeCandidateVo>;
  markAccepted(id: string, reviewedBy: string, note?: string): Promise<MergeCandidateVo | null>;
  markRejected(id: string, reviewedBy: string, note?: string): Promise<MergeCandidateVo | null>;
  markAcceptedBatch(ids: readonly string[], reviewedBy: string, note?: string): Promise<number>;
  markRejectedBatch(ids: readonly string[], reviewedBy: string, note?: string): Promise<number>;
  markStale(ids: readonly string[]): Promise<number>;
  /** Suppress duplicate suggestions for an already-rejected pairing. */
  isSuppressed(suppressionKey: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Output grant lifecycle
// ---------------------------------------------------------------------------
export interface IOutputGrantRepository {
  list(input: {
    ownerUserId: string;
    status?: OutputGrantSummaryVo["status"];
  }): Promise<OutputGrantSummaryVo[]>;
  findById(id: string): Promise<OutputGrantSummaryVo | null>;
  findByTokenHash(tokenHash: string): Promise<OutputGrantSummaryVo | null>;
  create(input: {
    ownerUserId: string;
    displayName: string;
    deviceClientId: string | null;
    profile: OutputGrantSummaryVo["profile"];
    tokenPrefix: string;
    tokenHash: string;
    expiresAt: Date | null;
  }): Promise<OutputGrantSummaryVo>;
  rotate(
    id: string,
    next: { tokenPrefix: string; tokenHash: string },
  ): Promise<OutputGrantSummaryVo | null>;
  revoke(id: string, reason: string | null): Promise<OutputGrantSummaryVo | null>;
  /** Bump lastUsedAt; race-tolerant (last-write-wins). */
  touchLastUsed(id: string, at: Date): Promise<void>;
}

// ---------------------------------------------------------------------------
// Output publication projection
// ---------------------------------------------------------------------------
export interface IOutputPublicationRepository {
  /** Read the current projection for a scope (defaults to "primary"). */
  read(scope?: string): Promise<OutputPublicationVo | null>;
  /** Atomically rewrite the projection after an apply / failover / grant change. */
  upsert(input: {
    scope: string;
    revision: string;
    status: OutputPublicationVo["status"];
    publishedAt: Date | null;
    channelCount: number;
    playableChannelCount: number;
    excludedChannelCount: number;
    blockingReason: string | null;
    lastApplyChangeSetId: string | null;
  }): Promise<OutputPublicationVo>;
}

// ---------------------------------------------------------------------------
// Stream health observation + failover event
// ---------------------------------------------------------------------------
export interface IStreamHealthObservationRepository {
  insert(input: {
    streamId: string;
    canonicalChannelId: string;
    source: StreamHealthObservationVo["source"];
    result: StreamHealthObservationVo["result"];
    errorClass: string | null;
    latencyMs: number | null;
    observedAt: Date;
    taskId: string | null;
    deviceClientId: string | null;
  }): Promise<StreamHealthObservationVo>;
  listByStream(input: {
    streamId: string;
    since?: Date;
    limit?: number;
  }): Promise<StreamHealthObservationVo[]>;
  listByCanonicalChannel(input: {
    canonicalChannelId: string;
    since?: Date;
    limit?: number;
  }): Promise<StreamHealthObservationVo[]>;
}

export interface IFailoverEventRepository {
  insert(input: {
    canonicalChannelId: string;
    previousStreamId: string | null;
    nextStreamId: string;
    trigger: FailoverEventVo["trigger"];
    reason: string;
    observedAt: Date;
    observedBy: string | null;
  }): Promise<FailoverEventVo>;
  listByCanonicalChannel(input: {
    canonicalChannelId: string;
    limit?: number;
  }): Promise<FailoverEventVo[]>;
}