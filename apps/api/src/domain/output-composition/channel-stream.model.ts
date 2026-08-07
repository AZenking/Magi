export type HealthStatus = "online" | "offline" | "degraded" | "unknown";

export interface ChannelStream {
  id: string;
  canonicalChannelId: string;
  m3uSourceId: string | null;
  rawChannelId: string | null;
  sourceChannelId: string | null;
  streamUrl: string;
  isPrimary: boolean;
  healthStatus: HealthStatus;
  responseTime: number | null;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastPlaybackReportAt?: Date | null;
  consecutiveFailures: number;
  successRate: number | null;
  streamError: string | null;
  streamCodec: string | null;
  streamFormat: string | null;
  streamWidth: number | null;
  streamHeight: number | null;
  streamFrameRate: number | null;
  streamBitrate: number | null;
  createdAt: Date;
  updatedAt: Date;
  // --- Safe Operations expand fields (T018). Ordered failover. ---
  origin?: "source" | "manual";
  position?: number | null;
  eligibleForFailover?: boolean;
  version?: number;
  // --- 009-m3u-control-plane (T028). Missing-retention lifecycle. ---
  /** When non-null, the source line is gone; stream excluded from output. */
  missingSince?: Date | null;
  /** Terminal state after 30-day retention expires. */
  purgedAt?: Date | null;
  consecutiveSuccesses?: number;
  failingSince?: Date | null;
  cooldownUntil?: Date | null;
}

export interface StreamWithSource extends ChannelStream {
  sourcePriority: number | null;
  sourceParticipateInOutput: boolean | null;
  sourceAllowFallback: boolean | null;
}

export class ChannelStreamModel {
  constructor(private readonly stream: ChannelStream) {}

  isAvailable(): boolean {
    return (
      // 009: a missing stream is NOT available even if its healthStatus is "online".
      (this.stream.missingSince == null || this.stream.origin === "manual") &&
      (this.stream.healthStatus === "online" || this.stream.healthStatus === "unknown")
    );
  }

  isBetterThan(other: ChannelStream): boolean {
    // 009: missing streams sink to the bottom of the ordering.
    const selfMissing =
      this.stream.missingSince != null && this.stream.origin !== "manual" ? 1 : 0;
    const otherMissing =
      other.missingSince != null && other.origin !== "manual" ? 1 : 0;
    if (selfMissing !== otherMissing) return selfMissing < otherMissing;

    const healthOrder: Record<HealthStatus, number> = { online: 0, unknown: 1, degraded: 2, offline: 3 };
    const healthDiff = (healthOrder[this.stream.healthStatus] ?? 3) - (healthOrder[other.healthStatus] ?? 3);
    if (healthDiff !== 0) return healthDiff < 0;
    if (this.stream.successRate != null && other.successRate != null) {
      return this.stream.successRate > other.successRate;
    }
    return (this.stream.responseTime ?? Infinity) < (other.responseTime ?? Infinity);
  }

  /** 009: a stream is eligible for output if it's manual OR source+present. */
  isOutputEligible(): boolean {
    if (this.stream.origin === "manual") return true;
    return this.stream.missingSince == null && this.stream.purgedAt == null;
  }

  toObject(): ChannelStream {
    return { ...this.stream };
  }
}
