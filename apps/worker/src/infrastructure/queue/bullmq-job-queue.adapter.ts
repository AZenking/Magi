/**
 * BullMQ job-queue adapter (T027).
 *
 * Implements `IJobQueuePort` against BullMQ. Infrastructure layer — imports
 * BullMQ, which the Worker application layer never imports (constitution III).
 *
 * Deduplication uses BullMQ's job ID option: when a `deduplicationId` is
 * supplied, it becomes the BullMQ job id so a second enqueue of the same id is
 * a no-op (research §7, first layer of dedup; the business layer adds the
 * persistent lease + idempotency-record checks).
 */
import { Queue } from "bullmq";
import type { IJobQueuePort } from "@/domain/job-execution";
import type { JobKind } from "@/domain/job-execution";
import { redis } from "../../redis";

export class BullMqJobQueueAdapter implements IJobQueuePort {
  private readonly queues = new Map<string, Queue>();

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: redis as never });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue(
    queue: string,
    name: JobKind,
    payload: Record<string, unknown>,
    options?: { deduplicationId?: string },
  ): Promise<string> {
    const q = this.queue(queue);
    const job = await q.add(name, payload, {
      ...(options?.deduplicationId && { jobId: options.deduplicationId }),
    });
    return job.id ?? "";
  }
}
