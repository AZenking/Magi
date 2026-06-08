import { Inject, Injectable } from "@nestjs/common";
import type { IHealthStatsRepository } from "@/domain/output-composition";

export interface HealthSummary {
  totalStreams: number;
  online: number;
  offline: number;
  degraded: number;
  unknown: number;
  avgResponseTime: number | null;
  totalChannels: number;
  activeChannels: number;
  degradedChannels: number;
  unavailableChannels: number;
}

@Injectable()
export class GetHealthSummaryUseCase {
  constructor(
    @Inject("HEALTH_STATS_REPOSITORY")
    private readonly healthRepo: IHealthStatsRepository,
  ) {}

  async execute(): Promise<HealthSummary> {
    const [streamStats, channelStats] = await Promise.all([
      this.healthRepo.getStreamHealthStats(),
      this.healthRepo.getChannelOutputStats(),
    ]);

    return {
      totalStreams: streamStats.total,
      online: streamStats.online,
      offline: streamStats.offline,
      degraded: streamStats.degraded,
      unknown: streamStats.unknown,
      avgResponseTime: streamStats.avgResponseTime,
      totalChannels: channelStats.total,
      activeChannels: channelStats.active,
      degradedChannels: channelStats.degraded,
      unavailableChannels: channelStats.unavailable,
    };
  }
}
