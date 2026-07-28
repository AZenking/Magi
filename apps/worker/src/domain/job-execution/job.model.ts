/**
 * Worker job domain model (T027).
 *
 * Framework-agnostic representation of a unit of async work. This is the
 * Worker-side mirror of the API's Task — it carries only what the Worker
 * needs to execute: stable payload, trace IDs, scope for dedup, and progress
 * reporting. No BullMQ / Drizzle / NestJS types (constitution III).
 */
export type JobKind =
  | "m3u-sync"
  | "xmltv-sync"
  | "epg-match"
  | "source-check"
  | "stream-check"
  | "import-epg"
  | "refresh-epg"
  | "cleanup"
  | "operation-prepare"
  | "operation-apply"
  | "operation-restore"
  | "operation-cleanup";

export interface JobPayload {
  readonly taskId: string;
  readonly requestId?: string | null;
  readonly changeSetId?: string | null;
  readonly scopeType?: string;
  readonly scopeId?: string;
  readonly parentTaskId?: string | null;
  readonly rootTaskId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly inputFingerprint?: string | null;
  readonly [extra: string]: unknown;
}

export interface JobResult {
  readonly taskId: string;
  readonly importedCount?: number;
  readonly addedCount?: number;
  readonly updatedCount?: number;
  readonly removedCount?: number;
  readonly matched?: number;
  readonly unmatched?: number;
  readonly conflicts?: number;
}

/** Coarse-grained progress reporting (constitution VII: milestones, not per-row). */
export interface JobProgress {
  update(percent: number, step: string): Promise<void>;
}

export interface Job {
  readonly id: string;
  readonly name: JobKind;
  readonly payload: JobPayload;
}

export class JobModel {
  constructor(private readonly job: Job) {}

  /** Scope key for dedup (research §7): {operation}:{targetStableId}. */
  deduplicationId(): string | null {
    if (!this.job.payload.scopeType || !this.job.payload.scopeId) return null;
    return `${this.job.payload.scopeType}:${this.job.payload.scopeId}`;
  }

  isOperationJob(): boolean {
    return (
      this.job.name === "operation-prepare" ||
      this.job.name === "operation-apply" ||
      this.job.name === "operation-restore" ||
      this.job.name === "operation-cleanup"
    );
  }

  toObject(): Job {
    return { ...this.job };
  }
}
