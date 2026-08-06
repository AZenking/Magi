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
}

export interface StreamWithSource extends ChannelStream {
  sourcePriority: number | null;
  sourceParticipateInOutput: boolean | null;
  sourceAllowFallback: boolean | null;
}

export class ChannelStreamModel {
  constructor(private readonly stream: ChannelStream) {}

  isAvailable(): boolean {
    return this.stream.healthStatus === "online" || this.stream.healthStatus === "unknown";
  }

  isBetterThan(other: ChannelStream): boolean {
    const healthOrder: Record<HealthStatus, number> = { online: 0, unknown: 1, degraded: 2, offline: 3 };
    const healthDiff = (healthOrder[this.stream.healthStatus] ?? 3) - (healthOrder[other.healthStatus] ?? 3);
    if (healthDiff !== 0) return healthDiff < 0;
    if (this.stream.successRate != null && other.successRate != null) {
      return this.stream.successRate > other.successRate;
    }
    return (this.stream.responseTime ?? Infinity) < (other.responseTime ?? Infinity);
  }

  toObject(): ChannelStream {
    return { ...this.stream };
  }
}
