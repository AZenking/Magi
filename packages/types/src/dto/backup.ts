/**
 * Backup wire DTOs (T008).
 *
 * ConfigBackup resource + create/restore requests. Bytes are never stored in
 * PostgreSQL and `storageRef` is never exposed. Mirror contracts/backups.md.
 */
import { z } from "zod";

export const BackupScopeSchema = z.object({
  sources: z.boolean().default(true),
  canonicalChannels: z.boolean().default(true),
  epgBindings: z.boolean().default(true),
  streams: z.boolean().default(true),
  schedules: z.boolean().default(true),
  policies: z.boolean().default(true),
});
export type BackupScope = z.infer<typeof BackupScopeSchema>;

export const CreateBackupRequestSchema = z.object({
  scope: BackupScopeSchema,
});
export type CreateBackupRequest = z.infer<typeof CreateBackupRequestSchema>;

export const ConfigBackupVoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["creating", "ready", "failed", "expired"]),
  formatVersion: z.number().int().nonnegative(),
  sourceAppVersion: z.string(),
  scope: BackupScopeSchema,
  capabilities: z.array(z.string()),
  objectCounts: z.record(z.string(), z.number()),
  checksum: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  canDownload: z.boolean(),
});
export type ConfigBackupVo = z.infer<typeof ConfigBackupVoSchema>;

/** Restore preflight summary (add/overwrite/skip/conflict/unsupported). */
export const RestoreSummarySchema = z.object({
  add: z.number().int().nonnegative(),
  overwrite: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  unsupported: z.number().int().nonnegative(),
});
export type RestoreSummary = z.infer<typeof RestoreSummarySchema>;
