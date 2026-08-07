// Existing entities (extended in-place by T017/T018).
export { m3uSources } from "./m3u-sources";
export { xmltvSources } from "./xmltv-sources";
export { channels } from "./channels";
export { rawM3uChannels } from "./raw-m3u-channels";
export { rawXmltvChannels } from "./raw-xmltv-channels";
export { programmes } from "./programmes";
export { syncLogs } from "./sync-logs";
export { canonicalChannels } from "./canonical-channels";
export { canonicalEpgBindings } from "./canonical-epg-bindings";
export { channelOverrides } from "./channel-overrides";
export { channelStreams } from "./channel-streams";
export { contentManifest } from "./content-manifest";
export { timestamps, createdAt, updatedAt } from "./helpers";
export { user, session, account, verification } from "./auth";

// New: operation preview/apply (T015).
export {
  sourceImportSnapshots,
  sourceImportSnapshotItems,
} from "./source-import-snapshots";
export {
  operationChangeSets,
  operationChangeItems,
} from "./operation-change-sets";
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

// OAuth2 Client Credentials Grant — replaces api_keys (004-safe-operations).
export { oauthClients } from "./oauth-clients";
export { oauthAccessTokens } from "./oauth-access-tokens";
export {
  deviceClients,
  deviceAuthorizationGrants,
  deviceRefreshTokens,
} from "./device-clients";

// 009-m3u-control-plane: weak-signal composition + per-player output access
// + unified health evidence. Existing schemas (raw_m3u_channels,
// channel_streams, operation_change_sets) are extended in-place with
// presence-retention, source-version and confirmation columns.
export { mergeCandidates } from "./merge-candidates";
export { streamHealthObservations } from "./stream-health-observations";
export { failoverEvents } from "./failover-events";
export { outputGrants } from "./output-grants";
export { outputPublications } from "./output-publications";
