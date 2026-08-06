import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly healthCheckQueue: Queue,
    private readonly sourceSyncQueue: Queue,
  ) {}

  async onModuleInit() {
    const streamCheckInterval = parseInt(process.env.SCHEDULE_STREAM_CHECK ?? "", 10);

    if (streamCheckInterval > 0) {
      await this.healthCheckQueue.add(
        "stream-check",
        { sourceId: null, sourceType: "m3u", taskType: "stream-check" },
        { repeat: { every: streamCheckInterval }, jobId: "scheduled-stream-check" },
      );
      this.logger.log(`Scheduled stream-check every ${streamCheckInterval}ms`);
    }

    // Daily cleanup
    await this.sourceSyncQueue.add(
      "cleanup",
      { sourceId: null, sourceType: "system", taskType: "cleanup" },
      { repeat: { every: 86_400_000 }, jobId: "scheduled-cleanup" },
    );
    this.logger.log("Scheduled daily cleanup");
  }
}
