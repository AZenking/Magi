/**
 * ConfigBackup domain model (T023).
 *
 * Backup metadata only — bytes live in `BackupObjectStorage` at an opaque
 * `storageRef` that is never exposed to clients (research §18, data-model.md).
 */
export type BackupStatus = "creating" | "ready" | "failed" | "expired";

export interface ConfigBackup {
  readonly id: string;
  status: BackupStatus;
  readonly formatVersion: number;
  readonly sourceAppVersion: string | null;
  readonly scope: Record<string, boolean>;
  readonly capabilities: readonly string[];
  readonly objectCounts: Record<string, number>;
  readonly checksum: string;
  /** Opaque reference into BackupObjectStorage — never returned to clients. */
  readonly storageRef: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly taskId: string | null;
}

export class ConfigBackupModel {
  constructor(private readonly backup: ConfigBackup) {}

  /** Download allowed only when ready and not expired (contracts/backups.md). */
  canDownload(now: Date = new Date()): boolean {
    return this.backup.status === "ready" && this.backup.expiresAt.getTime() > now.getTime();
  }

  /** Expiry removes the object before marking metadata expired (data-model.md). */
  isExpired(now: Date = new Date()): boolean {
    return this.backup.expiresAt.getTime() <= now.getTime();
  }

  toObject(): ConfigBackup {
    return { ...this.backup };
  }
}
