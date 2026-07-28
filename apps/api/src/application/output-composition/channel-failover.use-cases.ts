/**
 * Channel failover use cases (T116).
 *
 * Stream ordering, failover policy management, single-stream health check and
 * switch evaluation. Mirror contracts/channels.md (stream order, failover
 * policy, per-stream check) and the ChannelFailoverPolicyModel decisions.
 *
 * These use cases are framework-agnostic DI consumers — the HTTP layer wires
 * them with `@Inject`-decorated repository tokens (constitution III).
 */
import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import type {
  IChannelStreamRepository,
  ICanonicalChannelRepository,
  ChannelStream,
} from "@/domain/output-composition";
import {
  ChannelFailoverPolicyModel,
  type FailoverMode,
  type FailoverPolicyData,
} from "@/domain/output-composition/channel-failover-policy.model";
import type { ChannelFailoverPolicyRepository } from "@/infrastructure/database/channel-failover-policy.repository";

/** Default policy when none is persisted yet (data-model.md). */
const DEFAULT_POLICY: Omit<FailoverPolicyData, "canonicalChannelId"> = {
  mode: "auto_keep_fallback",
  failureThreshold: 3,
  recoveryThreshold: 2,
  cooldownSeconds: 60,
  lastSwitchAt: null,
  lastSwitchReason: null,
  version: 0,
};

// ---------------------------------------------------------------------------
// T116.1 — reorder streams (PUT /output/channels/:id/streams/order)
// ---------------------------------------------------------------------------
export interface ReorderStreamEntry {
  readonly id: string;
  readonly position: number;
  readonly isPrimary: boolean;
  readonly eligibleForFailover: boolean;
}

@Injectable()
export class ReorderChannelStreamsUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
  ) {}

  async execute(
    channelId: string,
    expectedVersion: number,
    entries: readonly ReorderStreamEntry[],
  ): Promise<ChannelStream[]> {
    const channel = await this.canonicalRepo.findById(channelId);
    if (!channel) throw new NotFoundException("Channel not found");
    if ((channel.version ?? 1) !== expectedVersion) {
      throw new BadRequestException("Channel version mismatch (reload and retry)");
    }

    const existing = await this.streamRepo.findByCanonicalChannelId(channelId);
    const existingIds = new Set(existing.map((s) => s.id));

    // Validate: every active stream listed exactly once, IDs belong to channel.
    const seen = new Set<string>();
    for (const e of entries) {
      if (!existingIds.has(e.id)) {
        throw new BadRequestException(`Stream ${e.id} does not belong to this channel`);
      }
      if (seen.has(e.id)) throw new BadRequestException(`Stream ${e.id} listed more than once`);
      seen.add(e.id);
    }
    // Positions contiguous from 0.
    const positions = entries.map((e) => e.position).sort((a, b) => a - b);
    positions.forEach((p, i) => {
      if (p !== i) throw new BadRequestException("Positions must be contiguous from 0");
    });
    // Exactly one primary when non-empty.
    if (entries.length > 0 && entries.filter((e) => e.isPrimary).length !== 1) {
      throw new BadRequestException("Exactly one primary stream is required");
    }

    const orderedIds = [...entries].sort((a, b) => a.position - b.position).map((e) => e.id);
    const reordered = await this.streamRepo.reorder(channelId, orderedIds);

    // Persist primary + eligibility flags alongside positions.
    await Promise.all(
      entries.map((e) =>
        this.streamRepo.update(e.id, {
          isPrimary: e.isPrimary,
          eligibleForFailover: e.eligibleForFailover,
          position: e.position,
        }),
      ),
    );

    return reordered;
  }
}

// ---------------------------------------------------------------------------
// T116.2 — update failover policy (PUT /output/channels/:id/failover-policy)
// ---------------------------------------------------------------------------
export interface FailoverPolicyInput {
  readonly mode: FailoverMode;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly cooldownSeconds: number;
}

@Injectable()
export class UpdateFailoverPolicyUseCase {
  constructor(
    @Inject("CANONICAL_CHANNEL_REPOSITORY")
    private readonly canonicalRepo: ICanonicalChannelRepository,
    private readonly policyRepo: ChannelFailoverPolicyRepository,
  ) {}

  async execute(channelId: string, input: FailoverPolicyInput): Promise<FailoverPolicyData> {
    const channel = await this.canonicalRepo.findById(channelId);
    if (!channel) throw new NotFoundException("Channel not found");

    if (input.failureThreshold < 1 || input.recoveryThreshold < 1 || input.cooldownSeconds < 0) {
      throw new BadRequestException("Thresholds must be positive; cooldown non-negative");
    }

    const row = await this.policyRepo.upsert({
      canonicalChannelId: channelId,
      mode: input.mode,
      failureThreshold: input.failureThreshold,
      recoveryThreshold: input.recoveryThreshold,
      cooldownSeconds: input.cooldownSeconds,
      lastSwitchAt: null,
      lastSwitchReason: null,
    });
    return { ...row } as FailoverPolicyData;
  }

  async find(channelId: string): Promise<FailoverPolicyData> {
    const row = await this.policyRepo.findByCanonicalChannelId(channelId);
    if (!row) return { ...DEFAULT_POLICY, canonicalChannelId: channelId };
    return { ...row } as FailoverPolicyData;
  }
}

// ---------------------------------------------------------------------------
// T116.3 — single-stream check (POST .../streams/:streamId/check)
// ---------------------------------------------------------------------------
/**
 * Enqueues a single-stream health check. Returns a task reference scoped to
 * that stream only (contracts/channels.md — only the target row shows pending).
 * The actual probe runs in the Worker; this use case just resolves the target
 * and forwards to the queue port.
 */
@Injectable()
export class CheckChannelStreamUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
  ) {}

  async execute(channelId: string, streamId: string): Promise<{ stream: ChannelStream }> {
    const stream = await this.streamRepo.findById(streamId);
    if (!stream || stream.canonicalChannelId !== channelId) {
      throw new NotFoundException("Stream not found on this channel");
    }
    // The HTTP layer triggers the queue via EnqueueSyncUseCase; this use case
    // only validates ownership and returns the resolved stream target.
    return { stream };
  }
}

// ---------------------------------------------------------------------------
// T116.4 — evaluate failover (Worker-side decision; API exposes history)
// ---------------------------------------------------------------------------
/**
 * Pure decision helper reused by the Worker evaluator. Given the current
 * ordered streams and policy, returns the stream id that should be primary
 * after a health event (or null for output loss).
 */
@Injectable()
export class EvaluateStreamFailoverUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    private readonly policyRepo: ChannelFailoverPolicyRepository,
  ) {}

  async evaluate(channelId: string): Promise<{ targetStreamId: string | null; policy: FailoverPolicyData }> {
    const ordered = await this.streamRepo.findOrderedByCanonicalChannelId(channelId);
    const policyRow = await this.policyRepo.findByCanonicalChannelId(channelId);
    const policyData: FailoverPolicyData = policyRow
      ? ({ ...policyRow } as FailoverPolicyData)
      : { ...DEFAULT_POLICY, canonicalChannelId: channelId };
    const model = new ChannelFailoverPolicyModel(policyData);

    const primary = ordered.find((s) => s.isPrimary) ?? ordered[0];
    if (!primary) return { targetStreamId: null, policy: policyData };

    const backups = ordered.filter((s) => s.id !== primary.id).map((s) => ({
      id: s.id,
      position: s.position ?? 0,
      isPrimary: s.isPrimary,
      eligibleForFailover: s.eligibleForFailover ?? true,
      consecutiveFailures: s.consecutiveFailures,
    }));
    const target = model.decideTarget(
      {
        id: primary.id,
        position: primary.position ?? 0,
        isPrimary: primary.isPrimary,
        eligibleForFailover: primary.eligibleForFailover ?? true,
        consecutiveFailures: primary.consecutiveFailures,
      },
      backups,
    );

    if (target && target !== primary.id) {
      await this.policyRepo.recordSwitch(channelId, "automatic-failover");
    }
    return { targetStreamId: target, policy: policyData };
  }
}
