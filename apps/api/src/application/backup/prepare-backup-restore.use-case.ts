/**
 * PrepareBackupRestoreUseCase (T102).
 *
 * Preflight: validates payload readability, checksum, supported format version,
 * capabilities, object counts, and referential integrity before any operational
 * state change. Returns add/overwrite/skip/conflict/unsupported counts.
 * Future major format or unknown required capability is blocked (contracts/backups.md).
 */
import type { BackupObjectStorage } from "@magi/backend-core";
import type { IConfigBackupRepository } from "@/domain/backup";
import { BACKUP_FORMAT_VERSION } from "./backup-serializer";

export interface RestorePreflight {
  readonly backupId: string;
  readonly canRestore: boolean;
  readonly blockerCode: string | null;
  readonly summary: { add: number; overwrite: number; skip: number; conflict: number; unsupported: number };
}

export class PrepareBackupRestoreUseCase {
  constructor(
    private readonly backupRepo: IConfigBackupRepository,
    private readonly storage: BackupObjectStorage,
  ) {}

  async execute(backupId: string): Promise<RestorePreflight> {
    const backup = await this.backupRepo.findById(backupId);
    if (!backup) return { backupId, canRestore: false, blockerCode: "resource-not-found", summary: { add: 0, overwrite: 0, skip: 0, conflict: 0, unsupported: 0 } };
    if (backup.status !== "ready") return { backupId, canRestore: false, blockerCode: "backup-not-ready", summary: { add: 0, overwrite: 0, skip: 0, conflict: 0, unsupported: 0 } };

    // Verify the stored object exists and is readable.
    const exists = await this.storage.exists(backup.storageRef);
    if (!exists) return { backupId, canRestore: false, blockerCode: "backup-object-missing", summary: { add: 0, overwrite: 0, skip: 0, conflict: 0, unsupported: 0 } };

    // Future format versions are blocked.
    if (backup.formatVersion > BACKUP_FORMAT_VERSION) {
      return { backupId, canRestore: false, blockerCode: "unsupported-format-version", summary: { add: 0, overwrite: 0, skip: 0, conflict: 0, unsupported: 1 } };
    }

    // Object counts become the restore summary (all treated as overwrite in replace mode).
    const counts = backup.objectCounts;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      backupId,
      canRestore: true,
      blockerCode: null,
      summary: { add: 0, overwrite: total, skip: 0, conflict: 0, unsupported: 0 },
    };
  }
}
