/**
 * ConfigBackup Drizzle repository (T025).
 *
 * Metadata only — bytes live in `BackupObjectStorage`. Expiry removes the
 * object before marking metadata expired (data-model.md). `storageRef` is
 * opaque and never exposed to clients (contracts/backups.md).
 */
import { eq, and, sql, desc } from "drizzle-orm";
import type { IConfigBackupRepository } from "@/domain/backup";
import type { ConfigBackup, BackupStatus } from "@/domain/backup";
import { db } from "./connection";
import { configBackups } from "./schema";

function toDomain(row: typeof configBackups.$inferSelect): ConfigBackup {
  return {
    id: row.id,
    status: row.status as BackupStatus,
    formatVersion: row.formatVersion,
    sourceAppVersion: row.sourceAppVersion,
    scope: row.scope as Record<string, boolean>,
    capabilities: row.capabilities as string[],
    objectCounts: row.objectCounts as Record<string, number>,
    checksum: row.checksum,
    storageRef: row.storageRef,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    taskId: row.taskId,
  };
}

export class ConfigBackupRepository implements IConfigBackupRepository {
  async create(data: Omit<ConfigBackup, "id" | "createdAt">): Promise<ConfigBackup> {
    const [row] = await db
      .insert(configBackups)
      .values({
        status: data.status,
        formatVersion: data.formatVersion,
        sourceAppVersion: data.sourceAppVersion,
        scope: data.scope,
        capabilities: [...data.capabilities],
        objectCounts: data.objectCounts,
        checksum: data.checksum,
        storageRef: data.storageRef,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
        taskId: data.taskId,
      })
      .returning();
    return toDomain(row!);
  }

  async findById(id: string): Promise<ConfigBackup | null> {
    const [row] = await db.select().from(configBackups).where(eq(configBackups.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findAll(params: { page: number; pageSize: number; status?: BackupStatus }): Promise<{
    items: ConfigBackup[];
    total: number;
  }> {
    const conds = [];
    if (params.status) conds.push(eq(configBackups.status, params.status));
    const where = conds.length > 0 ? and(...conds) : undefined;
    const [items, countResult] = await Promise.all([
      db.select().from(configBackups).where(where).orderBy(desc(configBackups.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(configBackups).where(where),
    ]);
    return { items: items.map(toDomain), total: countResult[0]?.count ?? 0 };
  }

  async updateStatus(id: string, status: BackupStatus): Promise<ConfigBackup | null> {
    const [row] = await db.update(configBackups).set({ status }).where(eq(configBackups.id, id)).returning();
    return row ? toDomain(row) : null;
  }

  /** Caller MUST have successfully deleted the object first (data-model.md). */
  async markExpired(id: string): Promise<ConfigBackup | null> {
    const [row] = await db.update(configBackups).set({ status: "expired" }).where(eq(configBackups.id, id)).returning();
    return row ? toDomain(row) : null;
  }
}
