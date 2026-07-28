/**
 * BackupSerializer (T100).
 *
 * Produces a versioned, normalized backup manifest with payload checksum.
 * The serializer canonicalizes object key order (stable JSON) so checksums are
 * reproducible. Secrets are redacted via BackupRedactor before serialization.
 */
import { createHash } from "node:crypto";
import { redact } from "./backup-redactor";

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  formatVersion: number;
  sourceAppVersion: string;
  createdAt: string;
  capabilities: string[];
  scope: Record<string, boolean>;
  objectCounts: Record<string, number>;
  checksum: string;
}

export interface SerializedBackup {
  manifest: BackupManifest;
  payload: Buffer;
}

export interface BackupScopeData {
  sources?: unknown;
  canonicalChannels?: unknown;
  epgBindings?: unknown;
  streams?: unknown;
  schedules?: unknown;
  policies?: unknown;
}

/** Serialize a backup scope into a versioned manifest + redacted payload + checksum. */
export function serializeBackup(
  scope: BackupScopeData,
  options: { sourceAppVersion: string; capabilities?: string[] },
): SerializedBackup {
  const includedScope: Record<string, boolean> = {};
  for (const key of Object.keys(scope)) {
    includedScope[key] = scope[key as keyof BackupScopeData] != null;
  }

  // Redact secrets before computing the checksum.
  const redacted = redact(scope);
  const payloadJson = JSON.stringify(redacted, Object.keys(redacted).sort());
  const payload = Buffer.from(payloadJson, "utf8");
  const checksum = `sha256:${createHash("sha256").update(payload).digest("hex")}`;

  const objectCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (Array.isArray(value)) objectCounts[key] = value.length;
    else if (value && typeof value === "object") objectCounts[key] = Object.keys(value).length;
  }

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    sourceAppVersion: options.sourceAppVersion,
    createdAt: new Date().toISOString(),
    capabilities: options.capabilities ?? [],
    scope: includedScope,
    objectCounts,
    checksum,
  };

  return { manifest, payload };
}

/** Stable stringify for deterministic checksums (sorted keys, no undefined). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") + "}";
}
