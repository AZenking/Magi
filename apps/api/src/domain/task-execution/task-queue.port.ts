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
  /**
   * 009-m3u-control-plane (T010): explicit lease scope. When set, the queue
   * adapter acquires an `operation_leases` row before enqueue and releases it
   * on success/failure. Combined with `idempotencyKey`, this guarantees one
   * source-scoped change set is applied at a time per source.
   */
  leaseScope?: string;
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

/**
 * Lease contract used by source-scoped prepare/apply jobs (009 T010).
 *
 * - acquire: returns false if another live lease exists for the same scope.
 * - heartbeat: extends the lease TTL while a long job is running.
 * - release: clears the lease; idempotent for already-released leases.
 *
 * Implementations use the existing `operation_leases` table; the port exists
 * so tests can swap an in-memory implementation.
 */
export interface IOperationLeasePort {
  acquire(input: {
    scopeType: string;
    scopeId: string;
    holderId: string;
    ttlSeconds: number;
  }): Promise<{ acquired: boolean; leaseId: string | null }>;
  heartbeat(leaseId: string, ttlSeconds: number): Promise<boolean>;
  release(leaseId: string): Promise<void>;
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
