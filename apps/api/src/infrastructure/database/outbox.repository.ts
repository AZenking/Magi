/**
 * Outbox Drizzle repository (T025).
 *
 * Reliable transaction-to-async handoff (research §15, data-model.md). Written
 * in the same transaction as the business mutation + AuditEvent. Consumers are
 * idempotent by outbox ID.
 */
import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "./connection";
import { outboxEvents } from "./schema";

export interface OutboxRow {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  requestId: string | null;
  taskId: string | null;
  status: string;
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

function toDomain(row: typeof outboxEvents.$inferSelect): OutboxRow {
  return { ...row };
}

export class OutboxRepository {
  /** Enqueue within the same transaction as the business mutation. */
  async enqueue(data: {
    topic: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    requestId?: string | null;
    taskId?: string | null;
  }): Promise<OutboxRow> {
    const now = new Date();
    const [row] = await db
      .insert(outboxEvents)
      .values({
        topic: data.topic,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload,
        requestId: data.requestId ?? null,
        taskId: data.taskId ?? null,
        status: "pending",
        attempts: 0,
        availableAt: now,
      })
      .returning();
    return toDomain(row!);
  }

  /** Fetch the next batch of due, unpublished events. */
  async findPending(limit: number, now: Date): Promise<OutboxRow[]> {
    const rows = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, "pending"),
          sql`${outboxEvents.availableAt} <= ${sql.param(now, outboxEvents.availableAt)}`,
        ),
      )
      .orderBy(asc(outboxEvents.availableAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  /** Mark published; idempotent by outbox ID (consumers dedupe). */
  async markPublished(id: string): Promise<void> {
    await db
      .update(outboxEvents)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(outboxEvents.id, id));
  }

  /** Record a failed attempt; bump attempts and back off availability. */
  async markFailed(id: string, retryAfterMs: number): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        status: "failed",
        attempts: sql`${outboxEvents.attempts} + 1`,
        availableAt: new Date(Date.now() + retryAfterMs),
      })
      .where(eq(outboxEvents.id, id));
  }
}
