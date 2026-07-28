/**
 * ScheduledJob Drizzle repository (T025).
 *
 * Persistent scheduled-job configuration truth (research §9, data-model.md).
 * The BullMQ scheduler is a reconciled projection of this table. Save uses
 * If-Match on `version`; Cancel/reset sends no request (FR-022).
 */
import { eq, and } from "drizzle-orm";
import type { ScheduledJob } from "@/domain/task-execution/scheduled-job.model";
import { db } from "./connection";
import { scheduledJobConfigs } from "./schema";

function toDomain(row: typeof scheduledJobConfigs.$inferSelect): ScheduledJob {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    taskType: row.taskType,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    enabled: row.enabled,
    intervalMs: row.intervalMs,
    cronExpression: row.cronExpression,
    timeZone: row.timeZone,
    overlapPolicy: row.overlapPolicy as ScheduledJob["overlapPolicy"],
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
    lastSkipReason: row.lastSkipReason,
    version: row.version,
  };
}

export class ScheduledJobRepository {
  async findAll(): Promise<ScheduledJob[]> {
    const rows = await db.select().from(scheduledJobConfigs);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<ScheduledJob | null> {
    const [row] = await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(data: Omit<ScheduledJob, "version">): Promise<ScheduledJob> {
    const [row] = await db.insert(scheduledJobConfigs).values({
      id: data.id,
      name: data.name,
      description: data.description,
      taskType: data.taskType,
      scopeType: data.scopeType,
      scopeId: data.scopeId,
      enabled: data.enabled,
      intervalMs: data.intervalMs,
      cronExpression: data.cronExpression,
      timeZone: data.timeZone,
      overlapPolicy: data.overlapPolicy,
    }).returning();
    return toDomain(row!);
  }

  /** Optimistic-concurrency save; returns null on version mismatch (FR-022). */
  async updateIfVersion(id: string, data: Partial<ScheduledJob>, expectedVersion: number): Promise<ScheduledJob | null> {
    const [row] = await db
      .update(scheduledJobConfigs)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.intervalMs !== undefined && { intervalMs: data.intervalMs }),
        ...(data.cronExpression !== undefined && { cronExpression: data.cronExpression }),
        ...(data.timeZone !== undefined && { timeZone: data.timeZone }),
        ...(data.overlapPolicy !== undefined && { overlapPolicy: data.overlapPolicy }),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(scheduledJobConfigs.id, id), eq(scheduledJobConfigs.version, expectedVersion)))
      .returning();
    return row ? toDomain(row) : null;
  }

  /** Record the outcome of a run (projection; does not change config). */
  async recordRun(id: string, status: string, skipReason: string | null): Promise<void> {
    await db
      .update(scheduledJobConfigs)
      .set({ lastRunAt: new Date(), lastStatus: status, lastSkipReason: skipReason })
      .where(eq(scheduledJobConfigs.id, id));
  }

  /** Update the projected next-run timestamp after a save or scheduler reconcile. */
  async updateNextRun(id: string, nextRunAt: Date | null): Promise<void> {
    await db.update(scheduledJobConfigs).set({ nextRunAt }).where(eq(scheduledJobConfigs.id, id));
  }
}
