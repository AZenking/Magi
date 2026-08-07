/**
 * Drizzle implementation of IFailoverEventRepository (T009, 009).
 *
 * Append-only audit log of every primary-stream switch. One row per
 * decision; the aggregate use case inserts in the same transaction that
 * updates ChannelStream.isPrimary + canonical channel primaryStreamId.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./connection";
import { failoverEvents } from "./schema";
import type { IFailoverEventRepository } from "@/domain/output-composition";
import type { FailoverEventVo } from "@magi/types";

function toVo(row: typeof failoverEvents.$inferSelect): FailoverEventVo {
  return {
    id: row.id,
    canonicalChannelId: row.canonicalChannelId,
    previousStreamId: row.previousStreamId,
    nextStreamId: row.nextStreamId,
    trigger: row.trigger as FailoverEventVo["trigger"],
    reason: row.reason,
    observedAt: row.observedAt.toISOString(),
  };
}

export class FailoverEventRepository implements IFailoverEventRepository {
  async insert(input: {
    canonicalChannelId: string;
    previousStreamId: string | null;
    nextStreamId: string;
    trigger: FailoverEventVo["trigger"];
    reason: string;
    observedAt: Date;
    observedBy: string | null;
  }): Promise<FailoverEventVo> {
    const [row] = await db
      .insert(failoverEvents)
      .values({
        canonicalChannelId: input.canonicalChannelId,
        previousStreamId: input.previousStreamId,
        nextStreamId: input.nextStreamId,
        trigger: input.trigger,
        reason: input.reason,
        observedAt: input.observedAt,
        observedBy: input.observedBy,
      })
      .returning();
    return toVo(row!);
  }

  async listByCanonicalChannel(input: {
    canonicalChannelId: string;
    limit?: number;
  }): Promise<FailoverEventVo[]> {
    const rows = await db
      .select()
      .from(failoverEvents)
      .where(eq(failoverEvents.canonicalChannelId, input.canonicalChannelId))
      .orderBy(desc(failoverEvents.observedAt))
      .limit(input.limit ?? 20);
    return rows.map(toVo);
  }
}
