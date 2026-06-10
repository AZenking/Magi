import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { channelStreams, canonicalChannels } from "../schema";
import { probeStream } from "./ffprobe";

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
