/**
 * API database schema entry (T017/T018/T019).
 *
 * Constitution II mandates a single source of truth for Drizzle schema. The
 * operational tables live ONLY in `@magi/backend-core/src/database/schema`;
 * this file re-exports them so existing repository imports (`./schema`) keep
 * working. The duplicated copies that previously lived here have been removed.
 *
 * `auth` is API-specific (better-auth) and stays local.
 *
 * Drizzle-kit reads this entry via `drizzle.config.ts` → `schema` field. To
 * keep `db:generate` able to discover `pgTable` across the workspace boundary,
 * `drizzle.config.ts` also lists the backend-core schema source glob directly.
 */
export * from "./auth";
export {
  m3uSources,
  xmltvSources,
  channels,
  rawM3uChannels,
  rawXmltvChannels,
  programmes,
  syncLogs,
  canonicalChannels,
  channelOverrides,
  channelStreams,
  timestamps,
  createdAt,
  updatedAt,
  // Safe Operations (T015–T018)
  sourceImportSnapshots,
  sourceImportSnapshotItems,
  operationChangeSets,
  operationChangeItems,
  operationLeases,
  recoveryPoints,
  recoveryPointItems,
  auditEvents,
  outboxEvents,
  idempotencyRecords,
  canonicalChannelMembers,
  sourceChannelIdentityAliases,
  scheduledJobConfigs,
  configBackups,
  channelFailoverPolicies,
} from "@magi/backend-core";
