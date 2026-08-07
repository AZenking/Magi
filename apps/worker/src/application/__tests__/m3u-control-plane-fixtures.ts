/**
 * Worker-side test builders for the M3U control plane (T002).
 *
 * Internal (DB-row) shapes used by Worker apply/reconcile tests. The wire VO
 * shapes live in `apps/api/src/test/m3u-control-plane-fixtures.ts`. Keep this
 * file free of NestJS / Drizzle imports so it can be reused from pure unit
 * tests and integration tests alike.
 */

const UUID = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

export const fixtureSourceId = UUID("f001");
export const fixtureSnapshotId = UUID("f002");
export const fixtureChangeSetId = UUID("f003");
export const fixtureSourceChannelId = UUID("f004");
export const fixtureCanonicalChannelId = UUID("f005");
export const fixtureStreamId = UUID("f006");
export const fixtureRecoveryPointId = UUID("f007");
export const fixtureTaskId = UUID("f008");

export interface SnapshotItemRow {
  readonly channelIdentity: string;
  readonly collisionOrdinal?: number;
  readonly itemOrder: number;
  readonly payload: Record<string, unknown>;
  readonly checksum: string;
}

export interface BuildSnapshotInput {
  readonly id?: string;
  readonly sourceId?: string;
  readonly sourceVersion?: number;
  readonly contentFingerprint?: string;
  readonly status?: string;
  readonly itemCount?: number;
  readonly items?: readonly SnapshotItemRow[];
  readonly expiresAt?: Date;
}

export interface SnapshotRow {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceType: "m3u" | "xmltv";
  readonly contentFingerprint: string;
  readonly sourceVersion: number;
  readonly status: string;
  readonly itemCount: number;
  readonly parserVersion: string;
  readonly preparedTaskId: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly items: readonly SnapshotItemRow[];
}

export function buildSnapshotRow(overrides: BuildSnapshotInput = {}): SnapshotRow {
  const createdAt = new Date("2026-08-07T22:00:00Z");
  return {
    id: overrides.id ?? fixtureSnapshotId,
    sourceId: overrides.sourceId ?? fixtureSourceId,
    sourceType: "m3u",
    contentFingerprint:
      overrides.contentFingerprint ?? "sha256:snapshot-fingerprint-1",
    sourceVersion: overrides.sourceVersion ?? 1,
    status: overrides.status ?? "ready",
    itemCount: overrides.itemCount ?? overrides.items?.length ?? 0,
    parserVersion: "m3u-parser/v1",
    preparedTaskId: null,
    createdAt,
    expiresAt: overrides.expiresAt ?? new Date("2026-12-31T00:00:00Z"),
    items: overrides.items ?? [],
  };
}

export interface BuildSnapshotItemInput {
  readonly channelIdentity?: string;
  readonly collisionOrdinal?: number;
  readonly itemOrder?: number;
  readonly payload?: Record<string, unknown>;
  readonly checksum?: string;
}

export function buildSnapshotItemRow(
  overrides: BuildSnapshotItemInput = {},
): SnapshotItemRow {
  return {
    channelIdentity: overrides.channelIdentity ?? "cctv-1",
    collisionOrdinal: overrides.collisionOrdinal ?? 0,
    itemOrder: overrides.itemOrder ?? 0,
    payload: overrides.payload ?? { name: "CCTV-1 综合" },
    checksum: overrides.checksum ?? "sha256:item-1",
  };
}

export interface ChangeSetRow {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly scopeType: string;
  readonly scopeId: string;
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly inputFingerprint: string;
  readonly baseVersions: Record<string, unknown>;
  readonly summary: {
    added: number;
    updated: number;
    missing: number;
    deleted: number;
    preserved: number;
    conflicts: number;
    unmatched: number;
  };
  readonly warnings: readonly {
    code: string;
    message: string;
  }[];
  readonly requiresConfirmation: boolean;
  readonly sourceVersion: number;
  readonly requestedBy: string;
  readonly prepareTaskId: string | null;
  readonly applyTaskId: string | null;
  readonly expiresAt: Date;
  readonly version: number;
}

export interface BuildChangeSetInput {
  readonly id?: string;
  readonly sourceId?: string;
  readonly snapshotId?: string;
  readonly status?: string;
  readonly requiresConfirmation?: boolean;
  readonly summary?: Partial<ChangeSetRow["summary"]>;
  readonly warnings?: ChangeSetRow["warnings"];
  readonly inputFingerprint?: string;
  readonly sourceVersion?: number;
  readonly version?: number;
}

export function buildChangeSetRow(overrides: BuildChangeSetInput = {}): ChangeSetRow {
  return {
    id: overrides.id ?? fixtureChangeSetId,
    kind: "m3u_sync",
    status: overrides.status ?? "ready",
    scopeType: "source",
    scopeId: overrides.sourceId ?? fixtureSourceId,
    sourceId: overrides.sourceId ?? fixtureSourceId,
    snapshotId: overrides.snapshotId ?? fixtureSnapshotId,
    inputFingerprint:
      overrides.inputFingerprint ?? "sha256:change-set-fingerprint-1",
    baseVersions: { source: 1 },
    summary: {
      added: 1,
      updated: 0,
      missing: 0,
      deleted: 0,
      preserved: 0,
      conflicts: 0,
      unmatched: 0,
      ...overrides.summary,
    },
    warnings: overrides.warnings ?? [],
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    sourceVersion: overrides.sourceVersion ?? 1,
    requestedBy: "schedule",
    prepareTaskId: null,
    applyTaskId: null,
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    version: overrides.version ?? 1,
  };
}

export interface SourceChannelRow {
  readonly id: string;
  readonly sourceId: string;
  readonly channelIdentity: string;
  readonly tvgId: string | null;
  readonly tvgName: string | null;
  readonly displayName: string;
  readonly groupTitle: string | null;
  readonly tvgLogo: string | null;
  readonly streamUrl: string;
  readonly sourcePresence: "present" | "missing" | "purged";
  readonly missingSince: Date | null;
  readonly purgedAt: Date | null;
  readonly version: number;
}

export interface BuildSourceChannelInput {
  readonly id?: string;
  readonly sourceId?: string;
  readonly channelIdentity?: string;
  readonly tvgId?: string | null;
  readonly tvgName?: string | null;
  readonly displayName?: string;
  readonly groupTitle?: string | null;
  readonly streamUrl?: string;
  readonly sourcePresence?: SourceChannelRow["sourcePresence"];
  readonly missingSince?: Date | null;
  readonly purgedAt?: Date | null;
  readonly version?: number;
}

export function buildSourceChannelRow(
  overrides: BuildSourceChannelInput = {},
): SourceChannelRow {
  return {
    id: overrides.id ?? fixtureSourceChannelId,
    sourceId: overrides.sourceId ?? fixtureSourceId,
    channelIdentity: overrides.channelIdentity ?? "cctv-1",
    tvgId: overrides.tvgId ?? "cctv-1",
    tvgName: overrides.tvgName ?? overrides.displayName ?? "CCTV-1 综合",
    displayName: overrides.displayName ?? "CCTV-1 综合",
    groupTitle: overrides.groupTitle ?? "综合",
    tvgLogo: null,
    streamUrl:
      overrides.streamUrl ?? "https://cdn.example.com/cctv1/index.m3u8",
    sourcePresence: overrides.sourcePresence ?? "present",
    missingSince: overrides.missingSince ?? null,
    purgedAt: overrides.purgedAt ?? null,
    version: overrides.version ?? 1,
  };
}

export interface CanonicalMemberRow {
  readonly id: string;
  readonly canonicalChannelId: string;
  readonly sourceChannelId: string;
  readonly channelIdentity: string;
  readonly membershipSource: "automatic" | "manual" | "migrated";
  readonly active: boolean;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
  readonly version: number;
}

export interface BuildCanonicalMemberInput {
  readonly id?: string;
  readonly canonicalChannelId?: string;
  readonly sourceChannelId?: string;
  readonly channelIdentity?: string;
  readonly membershipSource?: CanonicalMemberRow["membershipSource"];
  readonly active?: boolean;
  readonly joinedAt?: Date;
  readonly leftAt?: Date | null;
}

export function buildCanonicalMemberRow(
  overrides: BuildCanonicalMemberInput = {},
): CanonicalMemberRow {
  return {
    id: overrides.id ?? UUID("f010"),
    canonicalChannelId:
      overrides.canonicalChannelId ?? fixtureCanonicalChannelId,
    sourceChannelId: overrides.sourceChannelId ?? fixtureSourceChannelId,
    channelIdentity: overrides.channelIdentity ?? "cctv-1",
    membershipSource: overrides.membershipSource ?? "automatic",
    active: overrides.active ?? true,
    joinedAt: overrides.joinedAt ?? new Date("2026-08-07T22:00:00Z"),
    leftAt: overrides.leftAt ?? null,
    version: 1,
  };
}

export interface ChannelStreamRow {
  readonly id: string;
  readonly canonicalChannelId: string;
  readonly m3uSourceId: string | null;
  readonly rawChannelId: string | null;
  readonly sourceChannelId: string | null;
  readonly streamUrl: string;
  readonly origin: "source" | "manual";
  readonly isPrimary: boolean;
  readonly position: number | null;
  readonly eligibleForFailover: boolean;
  readonly healthStatus: string;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly failingSince: Date | null;
  readonly cooldownUntil: Date | null;
  readonly missingSince: Date | null;
  readonly purgedAt: Date | null;
  readonly version: number;
}

export interface BuildStreamInput {
  readonly id?: string;
  readonly canonicalChannelId?: string;
  readonly m3uSourceId?: string | null;
  readonly rawChannelId?: string | null;
  readonly sourceChannelId?: string | null;
  readonly streamUrl?: string;
  readonly origin?: ChannelStreamRow["origin"];
  readonly isPrimary?: boolean;
  readonly position?: number | null;
  readonly eligibleForFailover?: boolean;
  readonly healthStatus?: string;
  readonly consecutiveFailures?: number;
  readonly consecutiveSuccesses?: number;
  readonly failingSince?: Date | null;
  readonly cooldownUntil?: Date | null;
  readonly missingSince?: Date | null;
  readonly purgedAt?: Date | null;
  readonly version?: number;
}

export function buildStreamRow(overrides: BuildStreamInput = {}): ChannelStreamRow {
  return {
    id: overrides.id ?? fixtureStreamId,
    canonicalChannelId:
      overrides.canonicalChannelId ?? fixtureCanonicalChannelId,
    m3uSourceId: overrides.m3uSourceId ?? fixtureSourceId,
    rawChannelId: overrides.rawChannelId ?? fixtureSourceChannelId,
    sourceChannelId: overrides.sourceChannelId ?? null,
    streamUrl:
      overrides.streamUrl ?? "https://cdn.example.com/cctv1/index.m3u8",
    origin: overrides.origin ?? "source",
    isPrimary: overrides.isPrimary ?? true,
    position: overrides.position ?? 0,
    eligibleForFailover: overrides.eligibleForFailover ?? true,
    healthStatus: overrides.healthStatus ?? "unknown",
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    consecutiveSuccesses: overrides.consecutiveSuccesses ?? 0,
    failingSince: overrides.failingSince ?? null,
    cooldownUntil: overrides.cooldownUntil ?? null,
    missingSince: overrides.missingSince ?? null,
    purgedAt: overrides.purgedAt ?? null,
    version: overrides.version ?? 1,
  };
}

export interface RecoveryPointRow {
  readonly id: string;
  readonly changeSetId: string;
  readonly status: "creating" | "ready" | "restoring" | "restored" | "invalid" | "expired";
  readonly items: readonly {
    entityType: string;
    entityId: string;
    snapshot: Record<string, unknown>;
  }[];
  readonly createdAt: Date;
}

export interface BuildRecoveryPointInput {
  readonly id?: string;
  readonly changeSetId?: string;
  readonly status?: RecoveryPointRow["status"];
  readonly items?: RecoveryPointRow["items"];
}

export function buildRecoveryPointRow(
  overrides: BuildRecoveryPointInput = {},
): RecoveryPointRow {
  return {
    id: overrides.id ?? fixtureRecoveryPointId,
    changeSetId: overrides.changeSetId ?? fixtureChangeSetId,
    status: overrides.status ?? "ready",
    items: overrides.items ?? [],
    createdAt: new Date("2026-08-07T22:00:00Z"),
  };
}
