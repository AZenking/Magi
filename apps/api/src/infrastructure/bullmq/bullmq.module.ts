import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisModule } from "../redis/redis.module";
import { SchedulerService } from "./scheduler";

export const QUEUE_NAMES = {
  SOURCE_SYNC: "source-sync",
  EPG: "epg",
  HEALTH_CHECK: "health-check",
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

@Module({
  imports: [RedisModule],
  providers: [
    {
      provide: "SOURCE_SYNC_QUEUE",
      useFactory: (redis: unknown) => new Queue(QUEUE_NAMES.SOURCE_SYNC, { connection: redis as never }),
      inject: ["REDIS"],
    },
    {
      provide: "EPG_QUEUE",
      useFactory: (redis: unknown) => new Queue(QUEUE_NAMES.EPG, { connection: redis as never }),
      inject: ["REDIS"],
    },
    {
      provide: "HEALTH_CHECK_QUEUE",
      useFactory: (redis: unknown) => new Queue(QUEUE_NAMES.HEALTH_CHECK, { connection: redis as never }),
      inject: ["REDIS"],
    },
    {
      provide: "QUEUE_DEFAULTS",
      useValue: DEFAULT_JOB_OPTIONS,
    },
    {
      provide: SchedulerService,
      useFactory: (healthCheckQueue: Queue, sourceSyncQueue: Queue) =>
        new SchedulerService(healthCheckQueue, sourceSyncQueue),
      inject: ["HEALTH_CHECK_QUEUE", "SOURCE_SYNC_QUEUE"],
    },
  ],
  exports: ["SOURCE_SYNC_QUEUE", "EPG_QUEUE", "HEALTH_CHECK_QUEUE", "QUEUE_DEFAULTS", SchedulerService],
})
export class BullmqModule {}
