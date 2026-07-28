import type { TaskType } from "./task.model";

export interface TaskPayload {
  sourceId: string | null;
  sourceType: string;
  [key: string]: unknown;
}

export interface EnqueueOptions {
  delay?: number;
  priority?: number;
  jobName?: string;
  // --- Safe Operations (T022): trace + dedup propagation across the queue boundary. ---
  requestId?: string;
  changeSetId?: string;
  inputFingerprint?: string;
  scopeType?: string;
  scopeId?: string;
  /** Deduplication ID for BullMQ jobId ({operation}:{target}:{inputVersion}). */
  deduplicationId?: string;
  parentTaskId?: string;
  rootTaskId?: string;
  idempotencyKey?: string;
}

export interface JobDetail {
  state: string;
  attemptsMade: number;
  progress: number | object;
  failedReason?: string;
  stacktrace?: string[];
  returnValue?: unknown;
  processedOn?: number;
  finishedOn?: number;
  timestamp?: number;
  jobAvailable: boolean;
}

export interface ScheduledJob {
  id: string;
  name: string;
  queueName: string;
  taskType: string;
  description: string;
  enabled: boolean;
  intervalMs: number | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
}

export interface TaskQueuePort {
  enqueue(taskType: TaskType, payload: TaskPayload, options?: EnqueueOptions): Promise<{ jobId: string; taskId: string }>;
  cancel(taskId: string): Promise<boolean>;
  retry(taskId: string): Promise<{ retried: boolean; newTaskId?: string }>;
  getJobState(jobId: string, queueName?: string | null): Promise<string | null>;
  getJobDetail(jobId: string, queueName?: string | null): Promise<JobDetail | null>;
  getScheduledJobs(): Promise<ScheduledJob[]>;
  updateSchedule(jobId: string, config: { intervalMs: number }): Promise<void>;
  triggerScheduledJob(jobId: string): Promise<{ taskId: string }>;
}
