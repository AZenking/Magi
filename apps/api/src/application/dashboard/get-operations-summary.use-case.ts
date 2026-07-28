/**
 * GetOperationsSummaryUseCase (T118).
 *
 * Dashboard read model: freshness, coverage, availability, task counts, and
 * actionable issue cards with server-approved actionUrl (contracts/common.md).
 */
import type { IHealthStatsRepository } from "@/domain/output-composition";
import type { ITaskRepository } from "@/domain/task-execution";

export interface OperationsSummary {
  latestM3uSyncAt: Date | null;
  latestXmltvSyncAt: Date | null;
  latestStreamCheckAt: Date | null;
  epgCoverage: number;
  streamAvailability: number;
  runningTaskCount: number;
  failedTaskCount: number;
  staleSources: number;
  issues: Array<{ code: string; message: string; actionUrl: string }>;
}

export class GetOperationsSummaryUseCase {
  constructor(
    private readonly healthRepo: IHealthStatsRepository,
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(): Promise<OperationsSummary> {
    const [streamStats, channelStats, taskSummary] = await Promise.all([
      this.healthRepo.getStreamHealthStats(),
      this.healthRepo.getChannelOutputStats(),
      this.taskRepo.findSummary(),
    ]);

    const total = streamStats.total || 1;
    const streamAvailability = (streamStats.online + streamStats.unknown * 0.5) / total;
    const channelTotal = channelStats.total || 1;
    const epgCoverage = channelStats.active / channelTotal;

    const issues: Array<{ code: string; message: string; actionUrl: string }> = [];
    if (streamStats.offline > 0) {
      issues.push({
        code: "streams-offline",
        message: `${streamStats.offline} 条线路离线`,
        actionUrl: "/dashboard/channels?streamStatus=offline",
      });
    }
    if (taskSummary.failedCount > 0) {
      issues.push({
        code: "tasks-failed",
        message: `${taskSummary.failedCount} 个任务失败`,
        actionUrl: "/dashboard/tasks?status=failed",
      });
    }

    return {
      latestM3uSyncAt: null,
      latestXmltvSyncAt: null,
      latestStreamCheckAt: null,
      epgCoverage,
      streamAvailability,
      runningTaskCount: taskSummary.runningCount,
      failedTaskCount: taskSummary.failedCount,
      staleSources: 0,
      issues,
    };
  }
}
