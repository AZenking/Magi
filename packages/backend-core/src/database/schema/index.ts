// Existing entities (extended in-place by T017/T018).
export { m3uSources } from "./m3u-sources";
export { xmltvSources } from "./xmltv-sources";
export { channels } from "./channels";
export { rawM3uChannels } from "./raw-m3u-channels";
export { rawXmltvChannels } from "./raw-xmltv-channels";
export { programmes } from "./programmes";
export { syncLogs } from "./sync-logs";
export { canonicalChannels } from "./canonical-channels";
export { channelOverrides } from "./channel-overrides";
export { channelStreams } from "./channel-streams";
export { timestamps, createdAt, updatedAt } from "./helpers";

// New: operation preview/apply (T015).
export { sourceImportSnapshots, sourceImportSnapshotItems } from "./source-import-snapshots";
export { operationChangeSets, operationChangeItems } from "./operation-change-sets";
export { operationLeases } from "./operation-leases";

// New: recovery / audit / outbox / idempotency (T016).
export { recoveryPoints, recoveryPointItems } from "./recovery-points";
export { auditEvents } from "./audit-events";
export { outboxEvents } from "./outbox-events";
export { idempotencyRecords } from "./idempotency-records";

// New: canonical membership / identity alias (T017).
export { canonicalChannelMembers } from "./canonical-channel-members";
export { sourceChannelIdentityAliases } from "./source-channel-identity-aliases";

// New: schedule / backup / failover (T018).
export { scheduledJobConfigs } from "./scheduled-job-configs";
export { configBackups } from "./config-backups";
export { channelFailoverPolicies } from "./channel-failover-policies";
