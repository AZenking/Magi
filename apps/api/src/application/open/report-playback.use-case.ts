/**
 * ReportPlaybackUseCase (008-pipeline-reliability T034, US3;
 * 009-m3u-control-plane T040 adds channel/stream ownership validation and
 * optional routing through the shared AggregateStreamHealthUseCase so
 * playback reports and active probes share the same failover decision).
 *
 * Accepts a client playback outcome (failure or success) for a specific stream
 * and updates the stream's health metrics. Merges with active probe results
 * by writing the same columns (consecutiveFailures, healthStatus) that
 * stream-check uses.
 *
 * Deduplicates rapid duplicate failure reports from the same device within a
 * 10-second window to prevent health inflation (FR-014).
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { IChannelStreamRepository, HealthStatus } from "@/domain/output-composition";
import { EvaluateStreamFailoverUseCase } from "@/application/output-composition/channel-failover.use-cases";
import { AggregateStreamHealthUseCase } from "@/application/output-composition/aggregate-stream-health.use-case";

interface ReportPlaybackCommand {
  channel_id: string;
  stream_id: string;
  outcome: "failure" | "success";
  error_kind: string | null;
  played_duration_ms: number;
  reported_at?: string;
  deviceClientId: string;
}

// In-process dedup: deviceClientId+streamId → last failure timestamp.
// A Map is sufficient for a single API instance; multi-instance deployments
// would need a shared cache, but the dedup is a soft optimization, not a
// correctness requirement (duplicate writes are idempotent on consecutiveFailures
// only within the window).
const recentFailures = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000;

@Injectable()
export class ReportPlaybackUseCase {
  constructor(
    @Inject("CHANNEL_STREAM_REPOSITORY")
    private readonly streamRepo: IChannelStreamRepository,
    @Optional()
    @Inject(EvaluateStreamFailoverUseCase)
    private readonly failoverUc?: EvaluateStreamFailoverUseCase,
    @Optional()
    @Inject(AggregateStreamHealthUseCase)
    private readonly aggregateUc?: AggregateStreamHealthUseCase,
  ) {}

  async execute(command: ReportPlaybackCommand): Promise<{ accepted: true }> {
    const stream = await this.streamRepo.findById(command.stream_id);

    // Stream may have been deleted by an admin — safely ignore (FR: no leak).
    if (!stream) return { accepted: true };

    // 009 T040: channel/stream ownership check. The request's channel_id is
    // the external canonical id (e.g. "magi:canon-1"); the stream's
    // canonicalChannelId is the row UUID. We compare the suffix after the
    // last ":" so the prefix convention doesn't couple us to the wire format.
    if (!ownsStream(stream.canonicalChannelId, command.channel_id)) {
      return { accepted: true };
    }

    // Dedup: skip if this device reported a failure for this stream <10s ago.
    if (command.outcome === "failure") {
      const dedupKey = `${command.deviceClientId}:${command.stream_id}`;
      const lastReport = recentFailures.get(dedupKey);
      const now = Date.now();
      if (lastReport && now - lastReport < DEDUP_WINDOW_MS) {
        return { accepted: true };
      }
      recentFailures.set(dedupKey, now);
    }

    // 009 T040: when the shared aggregate use case is wired, delegate to it
    // so observations + failover events land in one place. The legacy direct-
    // update path remains as fallback for deployments that haven't wired the
    // new providers yet.
    if (this.aggregateUc) {
      try {
        await this.aggregateUc.execute({
          streamId: command.stream_id,
          canonicalChannelId: stream.canonicalChannelId,
          source: "playback_report",
          result: command.outcome,
          errorClass: command.error_kind,
          latencyMs: null,
          observedAt: new Date(),
          taskId: null,
          deviceClientId: command.deviceClientId,
        });
        return { accepted: true };
      } catch {
        // Fall through to the legacy direct-update path.
      }
    }

    let newFailures: number;
    let healthStatus: HealthStatus;
    const now = new Date();

    if (command.outcome === "success") {
      newFailures = 0;
      healthStatus = "online";
    } else {
      newFailures = stream.consecutiveFailures + 1;
      healthStatus = newFailures >= 3 ? "offline" : "degraded";
    }

    await this.streamRepo.update(command.stream_id, {
      consecutiveFailures: newFailures,
      healthStatus,
      streamError: command.outcome === "failure" ? command.error_kind : null,
      lastPlaybackReportAt: now,
      lastSuccessAt: command.outcome === "success" ? now : stream.lastSuccessAt,
    });

    // 008-pipeline-reliability T038: after a playback failure updates health,
    // evaluate whether the primary stream should switch to a backup.
    if (command.outcome === "failure" && this.failoverUc) {
      try {
        const { targetStreamId } = await this.failoverUc.evaluate(stream.canonicalChannelId);
        if (targetStreamId && targetStreamId !== command.stream_id) {
          // Execute the primary switch.
          await this.streamRepo.update(command.stream_id, { isPrimary: false });
          await this.streamRepo.update(targetStreamId, { isPrimary: true });
        }
      } catch {
        // Failover evaluation is best-effort; never block the report acceptance.
      }
    }

    return { accepted: true };
  }
}

/**
 * 009 T040: ownership check. Accepts both bare UUIDs and prefixed wire IDs
 * (`magi:<canonical>`). Returns true when either side's bare form matches.
 */
function ownsStream(streamCanonicalId: string, wireChannelId: string): boolean {
  if (!wireChannelId) return false;
  const bareWire = wireChannelId.includes(":")
    ? wireChannelId.slice(wireChannelId.lastIndexOf(":") + 1)
    : wireChannelId;
  const bareStream = streamCanonicalId.includes(":")
    ? streamCanonicalId.slice(streamCanonicalId.lastIndexOf(":") + 1)
    : streamCanonicalId;
  return (
    streamCanonicalId === wireChannelId ||
    streamCanonicalId === bareWire ||
    bareStream === bareWire ||
    bareStream === wireChannelId
  );
}
