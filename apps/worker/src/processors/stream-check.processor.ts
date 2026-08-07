import { eq, sql, and } from "drizzle-orm";
import { db } from "../db";
import { channelStreams, canonicalChannels, channelFailoverPolicies } from "../schema";
import { probeStream } from "./ffprobe";
import { decideFailoverTarget, DEFAULT_FAILOVER_POLICY, type StreamForFailover, type FailoverPolicyConfig } from "@magi/backend-core";

interface StreamCheckResult {
  checked: number;
  online: number;
  offline: number;
  degraded: number;
}

export async function processStreamCheck(sourceId?: string, progress?: { updateProgress(pct: number, step: string): Promise<void> }): Promise<StreamCheckResult> {
  await progress?.updateProgress(5, "fetch");

  // Load streams, optionally filtered by source
  const streams = sourceId
    ? await db.select().from(channelStreams).where(eq(channelStreams.m3uSourceId, sourceId))
    : await db.select().from(channelStreams);

  if (streams.length === 0) {
    return { checked: 0, online: 0, offline: 0, degraded: 0 };
  }

  await progress?.updateProgress(10, "check");

  let checked = 0;
  let online = 0;
  let offline = 0;
  let degraded = 0;

  // Process in batches of 5 for concurrency control
  const BATCH_SIZE = 5;
  for (let i = 0; i < streams.length; i += BATCH_SIZE) {
    const batch = streams.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((s) => probeStream(s.streamUrl)));

    for (let j = 0; j < batch.length; j++) {
      const stream = batch[j]!;
      const result = results[j]!;

      const now = new Date();
      const prevFailures = stream.consecutiveFailures;

      if (result.status === "fulfilled") {
        const { ok, responseTime, codec, format, width, height, frameRate, bitrate } = result.value;
        if (ok) {
          online++;
          const newSuccessRate = stream.successRate != null
            ? Math.round((stream.successRate * 9 + 100) / 10)
            : 100;
          await db.update(channelStreams).set({
            healthStatus: "online",
            responseTime,
            lastCheckedAt: now,
            lastSuccessAt: now,
            consecutiveFailures: 0,
            successRate: newSuccessRate,
            streamError: null,
            streamCodec: codec ?? null,
            streamFormat: format ?? null,
            streamWidth: width ?? null,
            streamHeight: height ?? null,
            streamFrameRate: frameRate ?? null,
            streamBitrate: bitrate ?? null,
          }).where(eq(channelStreams.id, stream.id));
        } else {
          const newFailures = prevFailures + 1;
          const newStatus = newFailures >= 3 ? "offline" : "degraded";
          if (newStatus === "offline") offline++;
          else degraded++;
          const newSuccessRate = stream.successRate != null
            ? Math.round((stream.successRate * 9) / 10)
            : 0;
          await db.update(channelStreams).set({
            healthStatus: newStatus,
            responseTime,
            lastCheckedAt: now,
            consecutiveFailures: newFailures,
            successRate: newSuccessRate,
            streamError: result.value.error?.slice(0, 500) ?? "Probe failed",
            streamCodec: null,
            streamFormat: null,
            streamWidth: null,
            streamHeight: null,
            streamFrameRate: null,
            streamBitrate: null,
          }).where(eq(channelStreams.id, stream.id));
        }
      } else {
        // Unexpected error from probeStream (shouldn't happen, but safety net)
        const newFailures = prevFailures + 1;
        const newStatus = newFailures >= 3 ? "offline" : "degraded";
        if (newStatus === "offline") offline++;
        else degraded++;
        const errorMsg = (result.reason as Error)?.message?.slice(0, 500) ?? "Unknown error";
        const newSuccessRate = stream.successRate != null
          ? Math.round((stream.successRate * 9) / 10)
          : 0;
        await db.update(channelStreams).set({
          healthStatus: newStatus,
          lastCheckedAt: now,
          consecutiveFailures: newFailures,
          successRate: newSuccessRate,
          streamError: errorMsg,
          streamCodec: null,
          streamFormat: null,
          streamWidth: null,
          streamHeight: null,
          streamFrameRate: null,
          streamBitrate: null,
        }).where(eq(channelStreams.id, stream.id));
      }
      checked++;
    }

    const pct = Math.min(90, 10 + Math.round((checked / streams.length) * 80));
    await progress?.updateProgress(pct, `checked ${checked}/${streams.length}`);
  }

  // Recompute canonical outputStatus
  await progress?.updateProgress(95, "status");
  await recomputeCanonicalStatus();

  // 008-pipeline-reliability T037: evaluate automatic failover for channels
  // whose primary stream just became unhealthy.
  await evaluateFailovers();

  await progress?.updateProgress(100, "done");

  return { checked, online, offline, degraded };
}

async function recomputeCanonicalStatus(): Promise<void> {
  // Get all canonical channel IDs that have streams
  const result = await db
    .select({
      canonicalId: channelStreams.canonicalChannelId,
      total: sql<number>`count(*)::int`,
      onlineCount: sql<number>`count(*) filter (where ${channelStreams.healthStatus} in ('online', 'unknown'))::int`,
      offlineCount: sql<number>`count(*) filter (where ${channelStreams.healthStatus} = 'offline')::int`,
    })
    .from(channelStreams)
    .groupBy(channelStreams.canonicalChannelId);

  for (const row of result) {
    let outputStatus: string;
    if (row.onlineCount > 0) {
      outputStatus = "active";
    } else if (row.offlineCount === row.total) {
      outputStatus = "unavailable";
    } else {
      outputStatus = "degraded";
    }

    await db.update(canonicalChannels)
      .set({ outputStatus })
      .where(eq(canonicalChannels.id, row.canonicalId));
  }
}

/**
 * Evaluate automatic failover for channels whose primary stream is unhealthy.
 * Uses the shared decideFailoverTarget pure function (008 T037).
 */
async function evaluateFailovers(): Promise<void> {
  // Find channels where the current primary stream is offline or degraded.
  const unhealthyPrimaries = await db
    .select({
      id: channelStreams.id,
      canonicalChannelId: channelStreams.canonicalChannelId,
      isPrimary: channelStreams.isPrimary,
      position: channelStreams.position,
      eligibleForFailover: channelStreams.eligibleForFailover,
      consecutiveFailures: channelStreams.consecutiveFailures,
      healthStatus: channelStreams.healthStatus,
    })
    .from(channelStreams)
    .where(
      and(
        eq(channelStreams.isPrimary, true),
        sql`${channelStreams.healthStatus} in ('offline', 'degraded')`,
      ),
    );

  for (const primary of unhealthyPrimaries) {
    // Load all streams for this channel, ordered by position.
    const allStreams = await db
      .select({
        id: channelStreams.id,
        position: channelStreams.position,
        isPrimary: channelStreams.isPrimary,
        eligibleForFailover: channelStreams.eligibleForFailover,
        consecutiveFailures: channelStreams.consecutiveFailures,
      })
      .from(channelStreams)
      .where(eq(channelStreams.canonicalChannelId, primary.canonicalChannelId));

    const primaryForDecision: StreamForFailover = {
      id: primary.id,
      position: primary.position ?? 0,
      isPrimary: true,
      eligibleForFailover: primary.eligibleForFailover ?? true,
      consecutiveFailures: primary.consecutiveFailures,
    };
    const backups: StreamForFailover[] = allStreams
      .filter((s) => s.id !== primary.id)
      .map((s) => ({
        id: s.id,
        position: s.position ?? 0,
        isPrimary: s.isPrimary,
        eligibleForFailover: s.eligibleForFailover ?? true,
        consecutiveFailures: s.consecutiveFailures,
      }));

    // Load failover policy or use default.
    let policy: FailoverPolicyConfig = { ...DEFAULT_FAILOVER_POLICY, canonicalChannelId: primary.canonicalChannelId };
    const [policyRow] = await db
      .select()
      .from(channelFailoverPolicies)
      .where(eq(channelFailoverPolicies.canonicalChannelId, primary.canonicalChannelId))
      .limit(1);
    if (policyRow) {
      policy = {
        canonicalChannelId: policyRow.canonicalChannelId,
        mode: (policyRow.mode ?? "auto_keep_fallback") as FailoverPolicyConfig["mode"],
        failureThreshold: policyRow.failureThreshold ?? 3,
        recoveryThreshold: policyRow.recoveryThreshold ?? 2,
        cooldownSeconds: policyRow.cooldownSeconds ?? 60,
        lastSwitchAt: policyRow.lastSwitchAt,
        lastSwitchReason: policyRow.lastSwitchReason,
        version: policyRow.version ?? 1,
      };
    }

    const targetStreamId = decideFailoverTarget(primaryForDecision, backups, policy);

    // Switch primary if the decision differs from current.
    if (targetStreamId && targetStreamId !== primary.id) {
      await db.transaction(async (tx) => {
        await tx.update(channelStreams)
          .set({ isPrimary: false })
          .where(eq(channelStreams.id, primary.id));
        await tx.update(channelStreams)
          .set({ isPrimary: true })
          .where(eq(channelStreams.id, targetStreamId));
        await tx.update(canonicalChannels)
          .set({ primaryStreamId: targetStreamId })
          .where(eq(canonicalChannels.id, primary.canonicalChannelId));
        // Record the switch in policy.
        await tx.update(channelFailoverPolicies)
          .set({ lastSwitchAt: new Date(), lastSwitchReason: "automatic-failover" })
          .where(eq(channelFailoverPolicies.canonicalChannelId, primary.canonicalChannelId))
          .catch(() => {
            // Policy row may not exist; the update is best-effort.
          });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 009-m3u-control-plane (T034/T039) — single-stream probe + active-probe
// observation contract.
// ---------------------------------------------------------------------------

/** Shape of an active-probe observation (mirrors stream_health_observations row). */
export interface ActiveProbeObservation {
  readonly streamId: string;
  readonly canonicalChannelId: string;
  readonly source: "active_probe";
  readonly result: "success" | "failure";
  readonly errorClass: string | null;
  readonly latencyMs: number | null;
  readonly observedAt: string;
  readonly taskId: string | null;
  readonly deviceClientId: null;
}

/**
 * Pure builder for the active-probe observation row. Extracted so unit tests
 * can verify the shape without running the processor (which would hit
 * ffprobe + DB). The processor calls this then hands the result to the
 * observation repository's insert method.
 */
export function buildActiveProbeObservation(input: {
  streamId: string;
  canonicalChannelId: string;
  result: "success" | "failure";
  latencyMs: number | null;
  taskId?: string | null;
  errorClass?: string | null;
}): ActiveProbeObservation {
  return {
    streamId: input.streamId,
    canonicalChannelId: input.canonicalChannelId,
    source: "active_probe",
    result: input.result,
    errorClass: input.errorClass ?? null,
    latencyMs: input.latencyMs,
    observedAt: new Date().toISOString(),
    taskId: input.taskId ?? null,
    deviceClientId: null,
  };
}

/**
 * Run an active probe against a single stream and record the observation.
 *
 * 009 T034: this function MUST receive a streamId — passing undefined throws
 * synchronously so the worker can never accidentally fan out across a source.
 * The actual observation insert + failover decision land in T037/T038; this
 * implementation focuses on the contract surface that unit tests can verify.
 */
export async function processSingleStreamCheck(
  streamId: string | undefined,
  options?: { taskId?: string },
): Promise<{ ok: boolean; observation: ActiveProbeObservation }> {
  if (!streamId) {
    throw new Error("streamId is required for single-stream probe (T034)");
  }
  // Load the stream row to get its canonical channel + URL.
  const [stream] = await db
    .select({
      id: channelStreams.id,
      canonicalChannelId: channelStreams.canonicalChannelId,
      streamUrl: channelStreams.streamUrl,
    })
    .from(channelStreams)
    .where(eq(channelStreams.id, streamId))
    .limit(1);
  if (!stream) {
    throw new Error(`Stream not found: ${streamId}`);
  }

  // Probe the stream URL.
  const probe = await probeStream(stream.streamUrl);
  const ok = probe.ok;
  const observation = buildActiveProbeObservation({
    streamId,
    canonicalChannelId: stream.canonicalChannelId,
    result: ok ? "success" : "failure",
    latencyMs: probe.responseTime,
    taskId: options?.taskId,
    errorClass: ok ? null : (probe.error?.slice(0, 60) ?? "probe-failed"),
  });

  // NOTE: T037/T038 will insert the observation via StreamHealthObservationRepository
  // and invoke the shared aggregate use case. For now we keep the processor
  // contract surface so the unit tests can pin the shape.
  return { ok, observation };
}
