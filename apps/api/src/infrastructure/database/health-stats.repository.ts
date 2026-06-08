import { eq, sql } from "drizzle-orm";
import type { IHealthStatsRepository } from "@/domain/output-composition";
import { db } from "./connection";
import { channelStreams, canonicalChannels } from "./schema";

export class HealthStatsRepository implements IHealthStatsRepository {
  async getStreamHealthStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where ${channelStreams.healthStatus} = 'online')::int`,
        offline: sql<number>`count(*) filter (where ${channelStreams.healthStatus} = 'offline')::int`,
        degraded: sql<number>`count(*) filter (where ${channelStreams.healthStatus} = 'degraded')::int`,
        unknown: sql<number>`count(*) filter (where ${channelStreams.healthStatus} = 'unknown')::int`,
        avgResponseTime: sql<number | null>`avg(${channelStreams.responseTime})::int`,
      })
      .from(channelStreams);
    return row!;
  }

  async getChannelOutputStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${canonicalChannels.outputStatus} = 'active')::int`,
        degraded: sql<number>`count(*) filter (where ${canonicalChannels.outputStatus} = 'degraded')::int`,
        unavailable: sql<number>`count(*) filter (where ${canonicalChannels.outputStatus} = 'unavailable')::int`,
      })
      .from(canonicalChannels)
      .where(eq(canonicalChannels.hidden, false));
    return row!;
  }
}
