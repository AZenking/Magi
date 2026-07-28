/**
 * PrivateFileBackupObjectStorage (T101/T102 infrastructure).
 *
 * API-side adapter implementing BackupObjectStorage against a server-private
 * directory. Uses a temp file, checksum/size verification, fsync, and atomic
 * rename (data-model.md). The Worker has its own adapter pointing at the same
 * storage root.
 */
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { Injectable } from "@nestjs/common";
import type { BackupObjectStorage, StoredObject } from "@magi/backend-core";
import { randomUUID } from "node:crypto";

const STORAGE_ROOT = process.env.BACKUP_STORAGE_ROOT ?? "/app/data/backups";

@Injectable()
export class PrivateFileBackupObjectStorage implements BackupObjectStorage {
  private readonly root = resolve(STORAGE_ROOT);

  async write(data: Buffer | Readable): Promise<StoredObject> {
    await fs.mkdir(this.root, { recursive: true });
    const id = randomUUID();
    const storageRef = `${id}.bak`;
    const finalPath = join(this.root, storageRef);
    const tempPath = `${finalPath}.tmp.${process.pid}`;

    try {
      const buf = Buffer.isBuffer(data) ? data : await this.streamToBuffer(data);
      const hash = createHash("sha256").update(buf).digest("hex");
      await fs.writeFile(tempPath, buf);
      // fsync for durability.
      const fh = await fs.open(tempPath, "r");
      await fh.sync();
      await fh.close();
      // Atomic rename.
      await fs.rename(tempPath, finalPath);
      return { storageRef, size: buf.length, checksum: `sha256:${hash}` };
    } catch (err) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw err;
    }
  }

  async read(storageRef: string): Promise<Readable> {
    return createReadStream(join(this.root, storageRef));
  }

  async exists(storageRef: string): Promise<boolean> {
    try {
      await fs.access(join(this.root, storageRef));
      return true;
    } catch {
      return false;
    }
  }

  async remove(storageRef: string): Promise<void> {
    await fs.unlink(join(this.root, storageRef));
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
}
