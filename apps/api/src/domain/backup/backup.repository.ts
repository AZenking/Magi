/**
 * Backup repository port (T023). Metadata only — bytes go through
 * `BackupObjectStorage` (defined in @magi/backend-core).
 */
import type { ConfigBackup, BackupStatus } from "./config-backup.model";

export interface IConfigBackupRepository {
  create(data: Omit<ConfigBackup, "id" | "createdAt">): Promise<ConfigBackup>;
  findById(id: string): Promise<ConfigBackup | null>;
  findAll(params: { page: number; pageSize: number; status?: BackupStatus }): Promise<{
    items: ConfigBackup[];
    total: number;
  }>;
  updateStatus(id: string, status: BackupStatus): Promise<ConfigBackup | null>;
  /** Expire metadata only after the storage object is successfully deleted. */
  markExpired(id: string): Promise<ConfigBackup | null>;
}
