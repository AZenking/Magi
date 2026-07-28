/**
 * BackupObjectStorage port (T023).
 *
 * Shared between API and Worker (research §18). Defined ONCE in
 * `@magi/backend-core` so both apps consume the same contract; each provides its
 * own infrastructure adapter pointing at the same server-private storage root.
 *
 * First adapter uses a temporary file, checksum/size verification, fsync and
 * atomic rename (data-model.md). The database stores only the opaque
 * `storageRef`; it is never returned to clients. Downloads require an
 * authorized use case.
 */
export interface StoredObject {
  /** Opaque reference stored in the `config_backups.storage_ref` column. */
  readonly storageRef: string;
  readonly size: number;
  readonly checksum: string;
}

export interface BackupObjectWriter {
  /**
   * Write `data` to a server-private location using a temp file, verify
   * checksum and size, fsync, then atomically rename to the returned ref.
   * Failed writes must remove temporary files.
   */
  write(data: Buffer | NodeJS.ReadableStream): Promise<StoredObject>;
}

export interface BackupObjectReader {
  /** Open a stream for an authorized download. Throws if the ref is unknown. */
  read(storageRef: string): Promise<NodeJS.ReadableStream>;
  /** Whether the referenced object still exists. */
  exists(storageRef: string): Promise<boolean>;
}

export interface BackupObjectRemover {
  /**
   * Delete the object. Expiry metadata must not be marked expired until this
   * succeeds; transient failures remain retryable (data-model.md).
   */
  remove(storageRef: string): Promise<void>;
}

/**
 * Combined port implemented by API and Worker adapters. Application code
 * depends on this interface, never on `fs`/S3/etc. (constitution III).
 */
export interface BackupObjectStorage
  extends BackupObjectWriter,
    BackupObjectReader,
    BackupObjectRemover {}
