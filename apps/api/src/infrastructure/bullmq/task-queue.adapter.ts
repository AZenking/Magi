import { Inject, Injectable } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import type { ITaskRepository, TaskType, TaskQueuePort, TaskPayload, EnqueueOptions, JobDetail, ScheduledJob } from "@/domain/task-execution";
import { QUEUE_NAMES } from "./bullmq.module";

@Injectable()
export class BullmqTaskQueueAdapter implements TaskQueuePort {
  constructor(
    @Inject("TASK_REPOSITORY") private readonly taskRepo: ITaskRepository,
    @Inject("SOURCE_SYNC_QUEUE") private readonly sourceSyncQueue: Queue,
    @Inject("EPG_QUEUE") private readonly epgQueue: Queue,
    @Inject("HEALTH_CHECK_QUEUE") private readonly healthCheckQueue: Queue,
    @Inject("QUEUE_DEFAULTS") private readonly defaults: JobsOptions,
  ) {}

  private resolveQueue(taskType: TaskType): Queue {
    switch (taskType) {
      case "m3u-sync":
      case "xmltv-sync":
      case "source-check":
        return this.sourceSyncQueue;
      case "epg-match":
      case "import-epg":
      case "refresh-epg":
        return this.epgQueue;
      case "stream-check":
        return this.healthCheckQueue;
      default:
        return this.sourceSyncQueue;
    }
  }

  async enqueue(taskType: TaskType, payload: TaskPayload, options?: EnqueueOptions): Promise<{ jobId: string; taskId: string }> {
    const queue = this.resolveQueue(taskType);
    const jobName = options?.jobName ?? taskType;
    const startedAt = new Date();

    let task;
    try {
      task = await this.taskRepo.create({
        sourceType: payload.sourceType,
        taskType,
        sourceId: payload.sourceId,
        status: "pending",
        startedAt,
        finishedAt: null,
        error: null,
        progress: 0,
        currentStep: "queued",
        executionLog: null,
        importedCount: 0,
        addedCount: 0,
        updatedCount: 0,
        removedCount: 0,
        queueName: queue.name,
        jobName,
        jobId: null,
        attemptsMade: 0,
        processedOn: null,
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === "sync_logs_one_active_per_source" && payload.sourceId) {
        const existing = await this.taskRepo.findActiveBySource(taskType, payload.sourceId);
        return { jobId: existing!.jobId ?? existing!.id, taskId: existing!.id };
      }
      throw err;
    }

    try {
      // T042: deduplicationId takes precedence over task.id as the BullMQ jobId
      // so that re-enqueuing the same scope+fingerprint is a no-op (research §7).
      const jobId = options?.deduplicationId ?? task.id;
      // Inject trace context into the payload so the Worker can carry it through
      // logs, audit and the BullMQ job context (constitution VII).
      const enrichedPayload = {
        ...payload,
        taskId: task.id,
        ...(options?.requestId && { requestId: options.requestId }),
        ...(options?.changeSetId && { changeSetId: options.changeSetId }),
        ...(options?.inputFingerprint && { inputFingerprint: options.inputFingerprint }),
        ...(options?.scopeType && { scopeType: options.scopeType }),
        ...(options?.scopeId && { scopeId: options.scopeId }),
        ...(options?.parentTaskId && { parentTaskId: options.parentTaskId }),
        ...(options?.rootTaskId && { rootTaskId: options.rootTaskId }),
        ...(options?.idempotencyKey && { idempotencyKey: options.idempotencyKey }),
      };
      const job = await queue.add(jobName, enrichedPayload, {
        ...this.defaults,
        jobId,
        delay: options?.delay,
        priority: options?.priority,
      });
      await this.taskRepo.update(task.id, { jobId: job.id ?? jobId });
      return { jobId: job.id ?? jobId, taskId: task.id };
    } catch (err) {
      await this.taskRepo.update(task.id, { status: "failed", finishedAt: new Date(), error: `Queue add failed: ${(err as Error).message}`.slice(0, 500) });
      throw err;
    }
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = await this.taskRepo.findById(taskId);
    if (!task || !task.jobId) return false;

    const queue = this.resolveQueue(task.taskType);
    const job = await queue.getJob(task.jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === "waiting" || state === "delayed") {
      await job.remove();
      await this.taskRepo.update(taskId, { status: "cancelled", finishedAt: new Date() });
      return true;
    }

    return false;
  }

  async retry(taskId: string): Promise<{ retried: boolean; newTaskId?: string }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task || task.status !== "failed") return { retried: false };

    const queue = this.resolveQueue(task.taskType);
    const job = await queue.getJob(task.jobId!);
    if (!job) {
      const { taskId: newTaskId } = await this.enqueue(task.taskType, { sourceId: task.sourceId, sourceType: task.sourceType });
      return { retried: true, newTaskId };
    }

    await job.retry();
    await this.taskRepo.update(taskId, { status: "pending", finishedAt: null, error: null });
    return { retried: true };
  }

  async getJobState(jobId: string, queueName?: string | null): Promise<string | null> {
    const queues = queueName
      ? [this.getQueueByName(queueName)]
      : [this.sourceSyncQueue, this.epgQueue, this.healthCheckQueue];

    for (const queue of queues) {
      if (!queue) continue;
      const job = await queue.getJob(jobId);
      if (job) return job.getState();
    }
    return null;
  }

  async getJobDetail(jobId: string, queueName?: string | null): Promise<JobDetail | null> {
    const queues = queueName
      ? [this.getQueueByName(queueName)]
      : [this.sourceSyncQueue, this.epgQueue, this.healthCheckQueue];

    for (const queue of queues) {
      if (!queue) continue;
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        return {
          state,
          attemptsMade: job.attemptsMade,
          progress: job.progress as number | object ?? 0,
          failedReason: job.failedReason ?? undefined,
          stacktrace: job.stacktrace?.length ? job.stacktrace : undefined,
          returnValue: job.returnvalue ?? undefined,
          processedOn: job.processedOn ?? undefined,
          finishedOn: job.finishedOn ?? undefined,
          timestamp: job.timestamp ?? undefined,
          jobAvailable: true,
        };
      }
    }

    return { state: "unknown", attemptsMade: 0, progress: 0, jobAvailable: false };
  }

  private getQueueByName(name: string): Queue | null {
    switch (name) {
      case QUEUE_NAMES.SOURCE_SYNC: return this.sourceSyncQueue;
      case QUEUE_NAMES.EPG: return this.epgQueue;
      case QUEUE_NAMES.HEALTH_CHECK: return this.healthCheckQueue;
      default: return null;
    }
  }

  private static readonly JOB_REGISTRY: {
    jobId: string;
    name: string;
    queueName: string;
    taskType: TaskType;
    description: string;
  }[] = [
    {
      jobId: "scheduled-stream-check",
      name: "流健康检查",
      queueName: QUEUE_NAMES.HEALTH_CHECK,
      taskType: "stream-check",
      description: "定期检测所有播放源的在线状态和响应时间",
    },
    {
      jobId: "scheduled-source-sync",
      name: "源同步",
      queueName: QUEUE_NAMES.SOURCE_SYNC,
      taskType: "m3u-sync",
      description: "定期同步 M3U 源的频道数据",
    },
    {
      jobId: "scheduled-cleanup",
      name: "系统清理",
      queueName: QUEUE_NAMES.SOURCE_SYNC,
      taskType: "cleanup",
      description: "每日清理过期任务和孤立频道数据",
    },
  ];

  async getScheduledJobs(): Promise<ScheduledJob[]> {
    const allRepeatable = await Promise.all([
      this.healthCheckQueue.getRepeatableJobs(),
      this.sourceSyncQueue.getRepeatableJobs(),
      this.epgQueue.getRepeatableJobs(),
    ]);
    const repeatableMap = new Map(allRepeatable.flat().map((r) => [r.key, r]));

    return BullmqTaskQueueAdapter.JOB_REGISTRY.map((reg) => {
      const repeatable = repeatableMap.get(reg.jobId);
      return {
        id: reg.jobId,
        name: reg.name,
        queueName: reg.queueName,
        taskType: reg.taskType,
        description: reg.description,
        enabled: !!repeatable,
        intervalMs: repeatable?.every ? Number(repeatable.every) : null,
        nextRunAt: repeatable?.next ? new Date(repeatable.next) : null,
        lastRunAt: null,
        lastStatus: null,
      };
    });
  }

  async updateSchedule(jobId: string, config: { intervalMs: number }): Promise<void> {
    const reg = BullmqTaskQueueAdapter.JOB_REGISTRY.find((r) => r.jobId === jobId);
    if (!reg) throw new Error(`Unknown scheduled job: ${jobId}`);

    const queue = this.getQueueByName(reg.queueName);
    if (!queue) throw new Error(`Queue not found: ${reg.queueName}`);

    // Remove existing repeatable
    const existing = (await queue.getRepeatableJobs()).find((r) => r.key === jobId);
    if (existing) {
      await queue.removeRepeatableByKey(existing.key);
    }

    // Add new if enabled
    if (config.intervalMs > 0) {
      await queue.add(
        reg.taskType,
        { sourceId: null, sourceType: reg.taskType === "stream-check" ? "m3u" : "system", taskType: reg.taskType },
        { repeat: { every: config.intervalMs }, jobId: reg.jobId },
      );
    }
  }

  async triggerScheduledJob(jobId: string): Promise<{ taskId: string }> {
    const reg = BullmqTaskQueueAdapter.JOB_REGISTRY.find((r) => r.jobId === jobId);
    if (!reg) throw new Error(`Unknown scheduled job: ${jobId}`);
    return this.enqueue(reg.taskType, {
      sourceId: null,
      sourceType: reg.taskType === "stream-check" ? "m3u" : "system",
      taskType: reg.taskType,
    });
  }
}
