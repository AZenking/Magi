import { eq, and, sql, desc } from "drizzle-orm";
import type { ITaskRepository, Task, TaskStatus, TaskType } from "@/domain/task-execution";
import { db } from "./connection";
import { syncLogs } from "./schema";

function toDomain(row: typeof syncLogs.$inferSelect): Task {
  return {
    ...row,
    taskType: row.taskType as TaskType,
    status: row.status as TaskStatus,
  };
}

export class SyncLogRepository implements ITaskRepository {
  async findAll(params: {
    page: number;
    pageSize: number;
    status?: TaskStatus;
    sourceType?: string;
    taskType?: string;
  }): Promise<{ items: Task[]; total: number }> {
    const { page, pageSize, status, sourceType, taskType } = params;
    const conditions = [];
    if (status) conditions.push(eq(syncLogs.status, status));
    if (sourceType) conditions.push(eq(syncLogs.sourceType, sourceType));
    if (taskType) conditions.push(eq(syncLogs.taskType, taskType));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db.select().from(syncLogs).where(where).orderBy(desc(syncLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(syncLogs).where(where),
    ]);

    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<Task | null> {
    const [row] = await db.select().from(syncLogs).where(eq(syncLogs.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(data: Omit<Task, "id" | "createdAt">): Promise<Task> {
    const [row] = await db.insert(syncLogs).values({
      sourceType: data.sourceType,
      taskType: data.taskType,
      sourceId: data.sourceId,
      status: data.status,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      error: data.error,
      progress: data.progress,
      currentStep: data.currentStep,
      executionLog: data.executionLog,
      importedCount: data.importedCount,
      addedCount: data.addedCount,
      updatedCount: data.updatedCount,
      removedCount: data.removedCount,
    }).returning();
    return toDomain(row!);
  }

  async update(id: string, data: Partial<Pick<Task, "status" | "finishedAt" | "error" | "progress" | "currentStep" | "executionLog" | "importedCount" | "addedCount" | "updatedCount" | "removedCount">>): Promise<Task | null> {
    const [row] = await db.update(syncLogs).set(data).where(eq(syncLogs.id, id)).returning();
    return row ? toDomain(row) : null;
  }
}
