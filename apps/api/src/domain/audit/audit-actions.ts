/**
 * Stable audit action catalogue.
 *
 * Keep these values independent from route names so audit filters and exports
 * remain compatible when HTTP endpoints are reorganised.
 */
export const AUDIT_ACTIONS = {
  source: {
    create: "source.create",
    update: "source.update",
    delete: "source.delete",
    syncTrigger: "source.sync.trigger",
    checkTrigger: "source.check.trigger",
  },
  channel: {
    update: "channel.update",
    logoUpdate: "channel.logo.update",
    lifecycleChange: "channel.lifecycle.change",
    epgBindingUpdate: "channel.epg_binding.update",
    batchUpdate: "channel.batch.update",
    streamCreate: "channel.stream.create",
    streamUpdate: "channel.stream.update",
    streamDelete: "channel.stream.delete",
    streamSetPrimary: "channel.stream.set_primary",
    streamReorder: "channel.stream.reorder",
    failoverPolicyUpdate: "channel.failover_policy.update",
    streamCheckTrigger: "channel.stream.check.trigger",
  },
  epg: {
    matchTrigger: "epg.match.trigger",
    importTrigger: "epg.import.trigger",
    refreshTrigger: "epg.refresh.trigger",
  },
  schedule: {
    update: "schedule.update",
    trigger: "schedule.trigger",
  },
  task: {
    retry: "task.retry",
    cancel: "task.cancel",
  },
  operation: {
    apply: "operation.apply",
    cancel: "operation.cancel",
  },
  backup: {
    create: "backup.create",
    download: "backup.download",
  },
  apiKey: {
    create: "api_key.created",
    disable: "api_key.disabled",
    enable: "api_key.enabled",
    revoke: "api_key.revoked",
    delete: "api_key.deleted",
  },
  oauthClient: {
    create: "oauth_client.created",
    disable: "oauth_client.disabled",
    enable: "oauth_client.enabled",
    revoke: "oauth_client.revoked",
    delete: "oauth_client.deleted",
  },
} as const;

export function changedFieldNames(value: object): string[] {
  return Object.keys(value).sort();
}
