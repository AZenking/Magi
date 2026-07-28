/**
 * Test fixture builders for the Safe Operations feature Web layer.
 *
 * Task: T005 — builders for operation / task / channel / schedule test data.
 *
 * Consumed by the Web failure tests: T034 (operation preview), T053 (channel
 * lifecycle), T065 (EPG workbench), T079 (schedules + global task status),
 * T096 (backup/audit), T113 (failover + dashboard).
 *
 * ## Type source note (dependency ordering)
 *
 * Phase 2 (T006–T008) defines the wire VOs in `@magi/types` from the Zod
 * schemas. Until those land, the shapes here mirror the JSON examples in
 * `specs/004-safe-operations-workflow/contracts/*` so builders compile today
 * and Web tests can be written red-first. Once T006–T008 ship, replace each
 * `SafeOperationsXxx` local type below with `import type { XxxVo } from
 * "@magi/types"` — the builder signatures and field names already match.
 *
 * ## antd coupling note
 *
 * Builders are framework-agnostic data factories; they do not import antd.
 * The rendered-component assertions (stable IDs as React keys, single primary
 * button, target-scoped loading) live in the consuming `.test.tsx` files and
 * rely on `specs/004-safe-operations-workflow/antd-research.md` (T001).
 */

// ---------------------------------------------------------------------------
// Local wire shapes (mirror contracts/* until @magi/types VOs land).
// ---------------------------------------------------------------------------
export type OperationKind =
  | "m3u_sync"
  | "epg_match"
  | "source_delete"
  | "channel_lifecycle_batch"
  | "channel_purge"
  | "backup_restore"
  | "recovery_restore";

export type ChangeSetStatus =
  | "preparing"
  | "ready"
  | "applying"
  | "applied"
  | "failed"
  | "stale"
  | "cancelled"
  | "expired";

export type LifecycleState = "active" | "hidden" | "disabled" | "trashed";
export type SourcePresence = "present" | "missing" | "conflict";
export type TaskWireStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface OperationChangeSetVo {
  id: string;
  kind: OperationKind;
  status: ChangeSetStatus;
  expiresAt: string;
  version: number;
  operationFingerprint?: string;
  summary?: {
    added?: number;
    updated?: number;
    missing?: number;
    deleted?: number;
    preserved?: number;
    conflicts?: number;
    unmatched?: number;
  };
  warnings?: { code: string; message: string }[];
  blockers?: { code: string; message: string }[];
}

export interface OperationChangeItemVo {
  itemId: string;
  classification?: string;
  action?: string;
  selected: boolean;
  confidence?: number | null;
  reasonCode?: string;
  lockManualDecision?: boolean;
}

export interface TaskRefVo {
  id: string;
  type: string;
  status: TaskWireStatus;
  statusUrl: string;
  scope: { type: string; id: string };
  target: { type: string; id: string; displayName: string };
  submittedAt: string;
}

export interface TaskSummaryItemVo {
  id: string;
  type: string;
  status: TaskWireStatus;
  targetDisplayName: string;
}

export interface TaskSummaryVo {
  runningCount: number;
  failedCount: number;
  items: TaskSummaryItemVo[];
}

export interface ChannelVo {
  id: string;
  standardName: string;
  lifecycle: LifecycleState;
  lifecycleReason: string | null;
  trashedAt: string | null;
  purgeAfter: string | null;
  sourcePresence: SourcePresence;
  manualEpgLocked: boolean;
  primaryStreamId: string | null;
  streamCount: number;
  version: number;
}

export interface ScheduledJobVo {
  id: string;
  name: string;
  description: string;
  taskType: string;
  scope: { type: string; id: string };
  enabled: boolean;
  schedule: { type: string; intervalMs?: number };
  timeZone: string;
  overlapPolicy: "skip";
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: TaskWireStatus | null;
  lastSkipReason: string | null;
  version: number;
}

// ---------------------------------------------------------------------------
// Builders. Each builder accepts a partial override and fills deterministic
// defaults so tests stay readable. IDs default to stable, unique strings so
// React key / row-selection assertions (FR-015) are reliable.
// ---------------------------------------------------------------------------
const now = () => new Date("2026-07-27T10:00:00.000Z").toISOString();
const isoFromOffset = (offsetMs: number) =>
  new Date(Date.parse(now()) + offsetMs).toISOString();

let seq = 0;
const nid = (prefix: string) => `${prefix}-id-${++seq}`;

export function buildChangeSet(
  overrides: Partial<OperationChangeSetVo> & { id?: string } = {},
): OperationChangeSetVo {
  return {
    id: overrides.id ?? nid("change-set"),
    kind: "m3u_sync",
    status: "ready",
    expiresAt: isoFromOffset(24 * 60 * 60 * 1000),
    version: 1,
    summary: {
      added: 0,
      updated: 7200,
      missing: 0,
      deleted: 0,
      preserved: 2500,
      conflicts: 300,
      unmatched: 200,
    },
    warnings: [],
    blockers: [],
    ...overrides,
  };
}

export function buildChangeItem(
  overrides: Partial<OperationChangeItemVo> = {},
): OperationChangeItemVo {
  return {
    itemId: nid("item"),
    classification: "exact",
    action: "update",
    selected: true,
    confidence: null,
    reasonCode: "stable-identity-match",
    ...overrides,
  };
}

/**
 * Build a batch of change items split across the four EPG classifications so
 * workbench tests (T065) have a deterministic population per category.
 */
export function buildEpgWorkbenchItems(
  counts: { exact?: number; fuzzy?: number; conflict?: number; unmatched?: number } = {},
): OperationChangeItemVo[] {
  const { exact = 5, fuzzy = 3, conflict = 2, unmatched = 1 } = counts;
  const make = (
    n: number,
    classification: string,
    extra: Partial<OperationChangeItemVo>,
  ): OperationChangeItemVo[] =>
    Array.from({ length: n }, () =>
      buildChangeItem({
        classification,
        confidence: classification === "fuzzy" ? 0.72 : classification === "exact" ? 1 : null,
        selected: classification === "exact",
        ...extra,
      }),
    );
  return [
    ...make(exact, "exact", {}),
    ...make(fuzzy, "fuzzy", { selected: false }),
    ...make(conflict, "conflict", { selected: false, reasonCode: "multiple-candidates" }),
    ...make(unmatched, "unmatched", { selected: false, reasonCode: "no-candidate" }),
  ];
}

export function buildTaskRef(
  overrides: Partial<TaskRefVo> & { id?: string } = {},
): TaskRefVo {
  const id = overrides.id ?? nid("task");
  const {
    id: _omittedId,
    statusUrl: overriddenStatusUrl,
    ...rest
  } = overrides;
  void _omittedId;
  return {
    id,
    type: "m3u-sync-preview",
    status: "pending",
    statusUrl: overriddenStatusUrl ?? `/tasks/${id}`,
    scope: { type: "source", id: "source-1" },
    target: { type: "m3u-source", id: "source-1", displayName: "Primary IPTV" },
    submittedAt: now(),
    ...rest,
  };
}

export function buildTaskSummary(
  overrides: Partial<TaskSummaryVo> = {},
): TaskSummaryVo {
  return {
    runningCount: 0,
    failedCount: 0,
    items: [],
    ...overrides,
  };
}

/**
 * Build a global-status summary with `running`/`failed` items so the Header
 * (T090) and per-row target-scoped loading (FR-027) have data to assert.
 */
export function buildTaskSummaryWith(
  running: number,
  failed: number,
): TaskSummaryVo {
  const items: TaskSummaryItemVo[] = [
    ...Array.from({ length: running }, () => ({
      id: nid("running-task"),
      type: "m3u-sync-apply",
      status: "running" as const,
      targetDisplayName: "Primary IPTV",
    })),
    ...Array.from({ length: failed }, () => ({
      id: nid("failed-task"),
      type: "epg-match-apply",
      status: "failed" as const,
      targetDisplayName: "Daily EPG",
    })),
  ];
  return { runningCount: running, failedCount: failed, items };
}

export function buildChannel(
  overrides: Partial<ChannelVo> & { id?: string } = {},
): ChannelVo {
  return {
    id: overrides.id ?? nid("channel"),
    standardName: "CCTV-1",
    lifecycle: "active",
    lifecycleReason: null,
    trashedAt: null,
    purgeAfter: null,
    sourcePresence: "present",
    manualEpgLocked: false,
    primaryStreamId: null,
    streamCount: 1,
    version: 8,
    ...overrides,
  };
}

/**
 * Build a channel set spanning every lifecycle state so lifecycle-view tests
 * (T053) and SC-005 (in-product state comprehension) have a deterministic
 * cross-section.
 */
export function buildChannelSetAcrossLifecycles(): ChannelVo[] {
  return LIFECYCLES.map((lifecycle) =>
    buildChannel({
      id: `channel-lifecycle-${lifecycle}`,
      standardName: `频道-${lifecycle}`,
      lifecycle,
      ...(lifecycle === "disabled"
        ? { lifecycleReason: "维护中" }
        : { lifecycleReason: null }),
      ...(lifecycle === "trashed"
        ? {
            trashedAt: isoFromOffset(-60 * 60 * 1000),
            purgeAfter: isoFromOffset(30 * 24 * 60 * 60 * 1000),
          }
        : {}),
    }),
  );
}

export function buildSchedule(
  overrides: Partial<ScheduledJobVo> & { id?: string } = {},
): ScheduledJobVo {
  return {
    id: overrides.id ?? "m3u-sync-primary",
    name: "Primary source refresh",
    description: "Refresh primary M3U source",
    taskType: "m3u-sync",
    scope: { type: "source", id: "source-1" },
    enabled: true,
    schedule: { type: "interval", intervalMs: 3600000 },
    timeZone: "Asia/Shanghai",
    overlapPolicy: "skip",
    nextRunAt: isoFromOffset(60 * 60 * 1000),
    lastRunAt: null,
    lastStatus: null,
    lastSkipReason: null,
    version: 4,
    ...overrides,
  };
}

const LIFECYCLES: LifecycleState[] = ["active", "hidden", "disabled", "trashed"];

// ---------------------------------------------------------------------------
// T096 (backup/audit) + T113 (failover/dashboard) fixture builders.
// Mirror contracts/common.md (audit), contracts/backups.md (backup/recovery),
// contracts/channels.md (failover policy/stream order) and
// contracts/common.md (operations summary).
// ---------------------------------------------------------------------------

export function buildAuditEvent(
  overrides: Record<string, unknown> & { id?: string } = {},
) {
  return {
    id: overrides.id ?? nid("audit-event"),
    occurredAt: isoFromOffset(-5 * 60 * 1000),
    actorType: "user",
    actorId: "admin-1",
    action: "channel.lifecycle.change",
    targetType: "canonical-channel",
    targetId: "channel-1",
    displayName: "CCTV-1",
    result: "succeeded",
    requestId: "req-1",
    taskId: null,
    parentTaskId: null,
    changeSetId: null,
    recoveryPointId: null,
    summary: { from: "active", to: "hidden" },
    reason: "临时下线",
    ...overrides,
  };
}

export function buildBackup(
  overrides: Record<string, unknown> & { id?: string } = {},
) {
  return {
    id: overrides.id ?? nid("backup"),
    status: "ready",
    formatVersion: 1,
    sourceAppVersion: "0.1.0",
    scope: {
      sources: true,
      canonicalChannels: true,
      epgBindings: true,
      streams: true,
      schedules: true,
      policies: true,
    },
    capabilities: ["restore"],
    objectCounts: { channels: 100, streams: 300 },
    checksum: "sha256:abc",
    createdAt: isoFromOffset(-60 * 60 * 1000),
    expiresAt: isoFromOffset(29 * 24 * 60 * 60 * 1000),
    canDownload: true,
    ...overrides,
  };
}

export function buildRestoreSummary(
  overrides: Record<string, number> = {},
) {
  return {
    add: 10,
    overwrite: 5,
    skip: 2,
    conflict: 0,
    unsupported: 0,
    ...overrides,
  };
}

export function buildOperationsSummary(
  overrides: Record<string, unknown> = {},
) {
  return {
    latestM3uSyncAt: isoFromOffset(-30 * 60 * 1000),
    latestXmltvSyncAt: isoFromOffset(-45 * 60 * 1000),
    latestStreamCheckAt: isoFromOffset(-10 * 60 * 1000),
    epgCoverage: 0.85,
    tvgIdCoverage: 0.8,
    streamAvailability: 0.95,
    runningTaskCount: 1,
    failedTaskCount: 0,
    staleSources: 0,
    issues: [
      {
        code: "streams-offline",
        message: "2 条线路离线",
        actionUrl: "/dashboard/channels?streamStatus=offline",
      },
    ],
    ...overrides,
  };
}

export interface FailoverStream {
  readonly id: string;
  readonly position: number;
  readonly isPrimary: boolean;
  readonly eligibleForFailover: boolean;
  readonly streamUrl: string;
  readonly healthStatus: string;
}

export function buildFailoverStreams(
  overrides: Partial<FailoverStream>[] = [],
): FailoverStream[] {
  const base: FailoverStream[] = [
    {
      id: "stream-primary",
      position: 0,
      isPrimary: true,
      eligibleForFailover: true,
      streamUrl: "http://example.com/primary",
      healthStatus: "online",
    },
    {
      id: "stream-backup",
      position: 1,
      isPrimary: false,
      eligibleForFailover: true,
      streamUrl: "http://example.com/backup",
      healthStatus: "online",
    },
  ];
  if (overrides.length === 0) return base;
  return base.map((s, i) => ({ ...s, ...overrides[i] }));
}

export function buildFailoverPolicy(
  overrides: Record<string, unknown> = {},
) {
  return {
    canonicalChannelId: "channel-1",
    mode: "auto_keep_fallback",
    failureThreshold: 3,
    recoveryThreshold: 2,
    cooldownSeconds: 60,
    lastSwitchAt: null,
    lastSwitchReason: null,
    version: 1,
    ...overrides,
  };
}

/** Reset the internal id sequence so test files are order-independent. */
export function resetFixtureIds(): void {
  seq = 0;
}
