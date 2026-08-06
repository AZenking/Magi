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
    const sourceSyncInterval = parseInt(process.env.SCHEDULE_SOURCE_SYNC ?? "", 10);

    if (streamCheckInterval > 0) {
      await this.healthCheckQueue.add(
        "stream-check",
        { sourceId: null, sourceType: "m3u", taskType: "stream-check" },
        { repeat: { every: streamCheckInterval }, jobId: "scheduled-stream-check" },
      );
      this.logger.log(`Scheduled stream-check every ${streamCheckInterval}ms`);
    }

    if (sourceSyncInterval > 0) {
      await this.sourceSyncQueue.add(
        "m3u-sync",
        { sourceId: null, sourceType: "m3u", taskType: "m3u-sync" },
        { repeat: { every: sourceSyncInterval }, jobId: "scheduled-source-sync" },
      );
      this.logger.log(`Scheduled m3u source-sync every ${sourceSyncInterval}ms`);

      // 008-pipeline-reliability T019: schedule XMLTV sync alongside M3U so
      // both source types get periodic refresh without manual triggers.
      await this.sourceSyncQueue.add(
        "xmltv-sync",
        { sourceId: null, sourceType: "xmltv", taskType: "xmltv-sync" },
        { repeat: { every: sourceSyncInterval }, jobId: "scheduled-xmltv-sync" },
      );
      this.logger.log(`Scheduled xmltv source-sync every ${sourceSyncInterval}ms`);
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
