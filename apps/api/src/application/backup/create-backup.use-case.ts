/**
 * CreateBackupUseCase (T101).
 *
 * Serializes the operational configuration into a versioned, redacted backup,
 * writes it through BackupObjectStorage (atomic temp file + fsync + rename),
 * and records metadata in the config_backups table. Download requires
 * authorization; storageRef is never exposed (research §18, FR-021).
 */
import type { BackupObjectStorage } from "@magi/backend-core";
import type { IConfigBackupRepository } from "@/domain/backup";
import { serializeBackup, type BackupScopeData } from "./backup-serializer";

export interface CreateBackupInput {
  readonly scope: BackupScopeData;
  readonly sourceAppVersion: string;
  readonly capabilities?: string[];
  readonly createdBy: string;
}

export interface CreateBackupResult {
  readonly backupId: string;
  readonly status: string;
  readonly checksum: string;
  readonly expiresAt: Date;
}

export class CreateBackupUseCase {
  constructor(
    private readonly backupRepo: IConfigBackupRepository,
    private readonly storage: BackupObjectStorage,
  ) {}

  async execute(input: CreateBackupInput): Promise<CreateBackupResult> {
    const { manifest, payload } = serializeBackup(input.scope, {
      sourceAppVersion: input.sourceAppVersion,
      capabilities: input.capabilities,
    });

    // Write bytes through the shared port (atomic temp + fsync + rename).
    const stored = await this.storage.write(payload);

    if (stored.checksum !== manifest.checksum) {
      // Integrity mismatch — remove the bad object, do not record metadata.
      await this.storage.remove(stored.storageRef).catch(() => undefined);
      throw new Error("Backup checksum mismatch after write");
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const backup = await this.backupRepo.create({
      status: "ready",
      formatVersion: manifest.formatVersion,
      sourceAppVersion: manifest.sourceAppVersion,
      scope: manifest.scope,
      capabilities: manifest.capabilities,
      objectCounts: manifest.objectCounts,
      checksum: manifest.checksum,
      storageRef: stored.storageRef,
      createdBy: input.createdBy,
      expiresAt,
      taskId: null,
    });

    return {
      backupId: backup.id,
      status: backup.status,
      checksum: backup.checksum,
      expiresAt: backup.expiresAt,
    };
  }
}
