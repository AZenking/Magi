/**
 * ReportPlaybackUseCase (008-pipeline-reliability T034, US3).
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
  ) {}

  async execute(command: ReportPlaybackCommand): Promise<{ accepted: true }> {
    const stream = await this.streamRepo.findById(command.stream_id);

    // Stream may have been deleted by an admin — safely ignore (FR: no leak).
    if (!stream) return { accepted: true };

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
