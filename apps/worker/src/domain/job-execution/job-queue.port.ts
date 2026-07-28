/**
 * Worker job-queue port (T027).
 *
 * Abstraction over BullMQ. The Worker application enqueues/deduplicates through
 * this port; the BullMQ implementation lives in infrastructure/.
 */
import type { JobKind } from "./job.model";

export interface IJobQueuePort {
  /** Add a job to a queue. Returns the job id. */
  enqueue(
    queue: string,
    name: JobKind,
    payload: Record<string, unknown>,
    options?: { deduplicationId?: string },
  ): Promise<string>;
  /** Acknowledge (no-op for BullMQ; some backends need explicit ack). */
  ack?(jobId: string): Promise<void>;
}
