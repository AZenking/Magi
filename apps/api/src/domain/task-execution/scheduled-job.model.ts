/**
 * ScheduledJob domain model (T023).
 *
 * Persistent scheduled-job configuration — the source of truth (research §9,
 * data-model.md). Queue scheduler state is a reconciled projection.
 */
export type OverlapPolicy = "skip";

export interface ScheduledJob {
  readonly id: string;
  name: string;
  description: string | null;
  readonly taskType: string;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  enabled: boolean;
  intervalMs: number | null;
  cronExpression: string | null;
  timeZone: string;
  overlapPolicy: OverlapPolicy;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastSkipReason: string | null;
  version: number;
}

export class ScheduledJobModel {
  constructor(private readonly job: ScheduledJob) {}

  /** Save semantics: form changes do not call the repository (FR-022). */
  isEditable(): boolean {
    return true;
  }

  /** Disabled schedules preserve config; they just stop producing runs. */
  producesRuns(): boolean {
    return this.job.enabled && this.job.nextRunAt != null;
  }

  /** Exactly one schedule representation (interval or cron) must be set. */
  hasValidSchedule(): boolean {
    return (
      (this.job.intervalMs != null && this.job.intervalMs > 0) ||
      !!this.job.cronExpression
    );
  }

  toObject(): ScheduledJob {
    return { ...this.job };
  }
}
