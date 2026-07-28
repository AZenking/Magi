/**
 * DownloadBackupUseCase (T101).
 *
 * Authorized download of a ready backup. The opaque storageRef never leaves
 * the server; this use case resolves it and returns a readable byte stream +
 * filename for the HTTP layer to stream as an attachment
 * (contracts/backups.md GET /backups/{id}/download).
 *
 * Security: only `ready` backups may be downloaded; expired/failed/creating
 * states are refused before opening the object.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { BackupObjectStorage } from "@magi/backend-core";
import type { IConfigBackupRepository } from "@/domain/backup";

export interface DownloadBackupResult {
  readonly stream: NodeJS.ReadableStream;
  readonly filename: string;
  readonly checksum: string;
}

export class DownloadBackupUseCase {
  constructor(
    private readonly backupRepo: IConfigBackupRepository,
    private readonly storage: BackupObjectStorage,
  ) {}

  async execute(backupId: string): Promise<DownloadBackupResult> {
    const backup = await this.backupRepo.findById(backupId);
    if (!backup) throw new NotFoundException("Backup not found");
    if (backup.status !== "ready") {
      throw new ForbiddenException(`Backup is ${backup.status}, cannot download`);
    }

    const exists = await this.storage.exists(backup.storageRef);
    if (!exists) {
      throw new NotFoundException("Backup object is missing");
    }

    const stream = await this.storage.read(backup.storageRef);
    const filename = `magi-backup-${backup.id}.json`;
    return { stream, filename, checksum: backup.checksum };
  }
}
