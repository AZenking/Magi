/**
 * AggregateStreamHealthUseCase (009-m3u-control-plane T038).
 *
 * One atomic health-aggregation + failover action invoked by:
 *   - Worker active-probe processor (T039) after a stream probe
 *   - API playback-report endpoint (T040) after a device report
 *
 * Inputs: a single observation (active_probe | playback_report) + the
 * channel's policy + the current ordered stream set.
 *
 * Side effects (delegated to the injected ports):
 *   1. Insert the immutable observation row.
 *   2. Update the target stream's health fields (consecutiveFailures /
 *      consecutiveSuccesses / failingSince / cooldownUntil / healthStatus).
 *   3. If the policy allows and the threshold is crossed, swap primary and
 *      record a FailoverEvent in the same logical step.
 *
 * This is the single source of truth — M3U output, Open playback and the
 * dashboard all read the resulting state, so they can never disagree.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  decideFailoverTarget,
  isFailoverAutomatic,
} from "@magi/backend-core";
import type {
  IStreamHealthObservationRepository,
  IFailoverEventRepository,
  IChannelStreamRepository,
  ChannelStream,
} from "@/domain/output-composition";
import { ChannelFailoverPolicyRepository } from "@/infrastructure/database/channel-failover-policy.repository";
import type { FailoverPolicyData } from "@/domain/output-composition/channel-failover-policy.model";

/** Coerce a string mode from the DB row into the FailoverMode union. */
function coerceMode(raw: string | null | undefined): FailoverPolicyData["mode"] {
  if (raw === "manual_only" || raw === "auto_keep_fallback" || raw === "auto_restore_primary") {
    return raw;
  }
  return "auto_keep_fallback";
}

export type ObservationSource = "active_probe" | "playback_report";
export type ObservationResult = "success" | "failure";

export interface ObservationInput {
  readonly streamId: string;
  readonly canonicalChannelId: string;
  readonly source: ObservationSource;
  readonly result: ObservationResult;
  readonly errorClass: string | null;
  readonly latencyMs: number | null;
  readonly observedAt: Date;
  readonly taskId: string | null;
  readonly deviceClientId: string | null;
}

export interface AggregateResult {
  /** Whether the aggregate action triggered a primary switch. */
  readonly switchedPrimary: boolean;
  readonly previousStreamId: string | null;
  readonly nextStreamId: string | null;
  readonly trigger: "auto_failure_threshold" | "auto_recovery" | "manual" | null;
  readonly reason: string | null;
  readonly observationId: string;
}

@Injectable()
export class AggregateStreamHealthUseCase {
  constructor(
    @Inject("STREAM_HEALTH_OBSERVATION_REPOSITORY")
    private readonly observations: IStreamHealthObservationRepository,
    @Inject("FAILOVER_EVENT_REPOSITORY")
    private readonly events: IFailoverEventRepository,
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streams: IChannelStreamRepository,
    @Inject(ChannelFailoverPolicyRepository)
    private readonly policyRepo: ChannelFailoverPolicyRepository,
  ) {}

  async execute(input: ObservationInput): Promise<AggregateResult> {
    // 1. Persist the immutable observation. Always inserted, regardless of
    //    whether the policy acts on it.
    const observation = await this.observations.insert({
      streamId: input.streamId,
      canonicalChannelId: input.canonicalChannelId,
      source: input.source,
      result: input.result,
      errorClass: input.errorClass,
      latencyMs: input.latencyMs,
      observedAt: input.observedAt,
      taskId: input.taskId,
      deviceClientId: input.deviceClientId,
    });

    // 2. Load the stream + policy + ordered siblings.
    const stream = await this.streams.findById(input.streamId);
    if (!stream) {
      // Stale observation — stream was deleted. Safe to no-op; the
      // observation row remains as audit evidence.
      return {
        switchedPrimary: false,
        previousStreamId: null,
        nextStreamId: null,
        trigger: null,
        reason: "stream-deleted",
        observationId: observation.id,
      };
    }

    // 3. Update the stream's rolling health fields.
    const updated = this.applyObservationToStream(stream, input);
    await this.streams.update(stream.id, {
      healthStatus: updated.healthStatus,
      consecutiveFailures: updated.consecutiveFailures,
      consecutiveSuccesses: updated.consecutiveSuccesses,
      failingSince: updated.failingSince,
      lastCheckedAt: updated.lastCheckedAt,
      lastSuccessAt: updated.lastSuccessAt,
      lastPlaybackReportAt:
        input.source === "playback_report" ? input.observedAt : stream.lastPlaybackReportAt,
      responseTime: input.latencyMs ?? stream.responseTime,
    });

    // 4. Run the failover decision.
    const policyRow = await this.policyRepo.findByCanonicalChannelId(input.canonicalChannelId);
    const policy: FailoverPolicyData = policyRow
      ? {
          canonicalChannelId: policyRow.canonicalChannelId,
          mode: coerceMode(policyRow.mode),
          failureThreshold: policyRow.failureThreshold,
          recoveryThreshold: policyRow.recoveryThreshold,
          cooldownSeconds: policyRow.cooldownSeconds,
          lastSwitchAt: policyRow.lastSwitchAt,
          lastSwitchReason: policyRow.lastSwitchReason,
          version: policyRow.version,
        }
      : {
          canonicalChannelId: input.canonicalChannelId,
          mode: "auto_keep_fallback",
          failureThreshold: 3,
          recoveryThreshold: 2,
          cooldownSeconds: 60,
          lastSwitchAt: null,
          lastSwitchReason: null,
          version: 0,
        };

    if (!isFailoverAutomatic({ ...policy, lastSwitchAt: policy.lastSwitchAt })) {
      return {
        switchedPrimary: false,
        previousStreamId: null,
        nextStreamId: stream.isPrimary ? stream.id : null,
        trigger: null,
        reason: "policy-manual-only",
        observationId: observation.id,
      };
    }

    // Load all siblings to compute the decision.
    const all = await this.streams.findOrderedByCanonicalChannelId(input.canonicalChannelId);
    const current = all.find((s) => s.isPrimary) ?? all[0];
    if (!current) {
      return {
        switchedPrimary: false,
        previousStreamId: null,
        nextStreamId: null,
        trigger: null,
        reason: "no-streams",
        observationId: observation.id,
      };
    }

    const target = decideFailoverTarget(
      {
        id: current.id,
        position: current.position ?? 0,
        isPrimary: current.isPrimary,
        eligibleForFailover: current.eligibleForFailover ?? true,
        consecutiveFailures: updated.consecutiveFailures && current.id === stream.id
          ? updated.consecutiveFailures
          : current.consecutiveFailures,
      },
      all
        .filter((s) => s.id !== current.id)
        .map((s) => ({
          id: s.id,
          position: s.position ?? 0,
          isPrimary: s.isPrimary,
          eligibleForFailover: s.eligibleForFailover ?? true,
          consecutiveFailures: s.consecutiveFailures,
        })),
      { ...policy, lastSwitchAt: policy.lastSwitchAt },
    );

    if (!target || target === current.id) {
      return {
        switchedPrimary: false,
        previousStreamId: current.id,
        nextStreamId: current.id,
        trigger: null,
        reason: target ? "no-switch-needed" : "output-loss",
        observationId: observation.id,
      };
    }

    // 5. Flip primary + emit failover event.
    await this.streams.update(current.id, { isPrimary: false });
    await this.streams.update(target, { isPrimary: true });
    await this.policyRepo.recordSwitch(input.canonicalChannelId, "automatic-failover");
    const event = await this.events.insert({
      canonicalChannelId: input.canonicalChannelId,
      previousStreamId: current.id,
      nextStreamId: target,
      trigger: "auto_failure_threshold",
      reason: `consecutive-failures-${updated.consecutiveFailures}`,
      observedAt: input.observedAt,
      observedBy: input.source,
    });

    return {
      switchedPrimary: true,
      previousStreamId: current.id,
      nextStreamId: target,
      trigger: "auto_failure_threshold",
      reason: event.reason,
      observationId: observation.id,
    };
  }

  /** Compute the new stream health fields from the observation. Pure helper. */
  private applyObservationToStream(
    stream: ChannelStream,
    input: ObservationInput,
  ): {
    healthStatus: "online" | "offline" | "degraded" | "unknown";
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    failingSince: Date | null;
    lastCheckedAt: Date | null;
    lastSuccessAt: Date | null;
  } {
    const prevFailures = stream.consecutiveFailures ?? 0;
    const prevSuccesses = stream.consecutiveSuccesses ?? 0;
    if (input.result === "success") {
      return {
        healthStatus: "online",
        consecutiveFailures: 0,
        consecutiveSuccesses: prevSuccesses + 1,
        failingSince: null,
        lastCheckedAt: input.observedAt,
        lastSuccessAt: input.observedAt,
      };
    }
    const next = prevFailures + 1;
    return {
      healthStatus: next >= 3 ? "offline" : "degraded",
      consecutiveFailures: next,
      consecutiveSuccesses: 0,
      failingSince: stream.failingSince ?? input.observedAt,
      lastCheckedAt: input.observedAt,
      lastSuccessAt: stream.lastSuccessAt,
    };
  }
}
