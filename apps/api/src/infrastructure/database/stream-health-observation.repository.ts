/**
 * Drizzle implementation of IStreamHealthObservationRepository (T009, 009).
 *
 * Append-only evidence store. Insert + read-only list methods. The aggregate
 * use case reads recent observations to update ChannelStream health fields
 * and decide failover actions in one transaction.
 */
import { and, desc, eq, gte, type SQL } from "drizzle-orm";
import { db } from "./connection";
import { streamHealthObservations } from "./schema";
import type { IStreamHealthObservationRepository } from "@/domain/output-composition";
import type { StreamHealthObservationVo } from "@magi/types";

function toVo(row: typeof streamHealthObservations.$inferSelect): StreamHealthObservationVo {
  return {
    id: row.id,
    streamId: row.streamId,
    canonicalChannelId: row.canonicalChannelId,
    source: row.source as StreamHealthObservationVo["source"],
    result: row.result as StreamHealthObservationVo["result"],
    errorClass: row.errorClass,
    latencyMs: row.latencyMs,
    observedAt: row.observedAt.toISOString(),
    taskId: row.taskId,
    deviceClientId: row.deviceClientId,
  };
}

export class StreamHealthObservationRepository
  implements IStreamHealthObservationRepository
{
  async insert(input: {
    streamId: string;
    canonicalChannelId: string;
    source: StreamHealthObservationVo["source"];
    result: StreamHealthObservationVo["result"];
    errorClass: string | null;
    latencyMs: number | null;
    observedAt: Date;
    taskId: string | null;
    deviceClientId: string | null;
  }): Promise<StreamHealthObservationVo> {
    const [row] = await db
      .insert(streamHealthObservations)
      .values({
        streamId: input.streamId,
        canonicalChannelId: input.canonicalChannelId,
        source: input.source,
        result: input.result,
        errorClass: input.errorClass,
        latencyMs: input.latencyMs,
        observedAt: input.observedAt,
        taskId: input.taskId,
        deviceClientId: input.deviceClientId,
      })
      .returning();
    return toVo(row!);
  }

  async listByStream(input: {
    streamId: string;
    since?: Date;
    limit?: number;
  }): Promise<StreamHealthObservationVo[]> {
    const clauses: SQL[] = [eq(streamHealthObservations.streamId, input.streamId)];
    if (input.since) clauses.push(gte(streamHealthObservations.observedAt, input.since));
    const rows = await db
      .select()
      .from(streamHealthObservations)
      .where(clauses.length === 1 ? clauses[0] : and(...clauses))
      .orderBy(desc(streamHealthObservations.observedAt))
      .limit(input.limit ?? 50);
    return rows.map(toVo);
  }

  async listByCanonicalChannel(input: {
    canonicalChannelId: string;
    since?: Date;
    limit?: number;
  }): Promise<StreamHealthObservationVo[]> {
    const clauses: SQL[] = [
      eq(streamHealthObservations.canonicalChannelId, input.canonicalChannelId),
    ];
    if (input.since) clauses.push(gte(streamHealthObservations.observedAt, input.since));
    const rows = await db
      .select()
      .from(streamHealthObservations)
      .where(clauses.length === 1 ? clauses[0] : and(...clauses))
      .orderBy(desc(streamHealthObservations.observedAt))
      .limit(input.limit ?? 50);
    return rows.map(toVo);
  }
}
