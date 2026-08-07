/**
 * API-side test builders for the M3U control plane (T002).
 *
 * Pure factory helpers for the wire/DTO shapes defined in
 * `packages/types/src/dto/m3u-control-plane.ts`. Tests import these to keep
 * boilerplate down and avoid drift when DTOs evolve. No DB or NestJS imports
 * — keep this leaf-level so any contract / use-case test can pull it in.
 */
import type {
  M3uChangeSetVo,
  M3uChangeSetSummary,
  M3uChangeWarning,
  MergeCandidateVo,
  OutputGrantIssuedVo,
  OutputGrantSummaryVo,
  OutputPublicationVo,
  StreamHealthObservationVo,
  FailoverEventVo,
} from "@magi/types";

const UUID = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

export const fixtureOwnerUserId = "user-operator-1";

export const fixtureSourceId = UUID("a001");
export const fixtureSnapshotId = UUID("a002");
export const fixtureChangeSetId = UUID("a003");
export const fixtureSourceChannelId = UUID("a004");
export const fixtureCanonicalChannelId = UUID("a005");
export const fixtureStreamId = UUID("a006");
export const fixtureGrantId = UUID("a007");
export const fixtureDeviceClientId = UUID("a008");

export interface BuildChangeSetInput {
  readonly id?: string;
  readonly sourceId?: string;
  readonly snapshotId?: string;
  readonly status?: M3uChangeSetVo["status"];
  readonly requiresConfirmation?: boolean;
  readonly summary?: M3uChangeSetSummary;
  readonly warnings?: ReadonlyArray<M3uChangeWarning>;
  readonly snapshotExpiresAt?: string;
  readonly sourceVersion?: number;
  readonly version?: number;
  readonly inputFingerprint?: string;
}

export function buildChangeSetVo(
  overrides: BuildChangeSetInput = {},
): M3uChangeSetVo {
  return {
    id: overrides.id ?? fixtureChangeSetId,
    kind: "m3u_sync",
    status: overrides.status ?? "ready",
    sourceId: overrides.sourceId ?? fixtureSourceId,
    snapshotId: overrides.snapshotId ?? fixtureSnapshotId,
    inputFingerprint: overrides.inputFingerprint ?? "sha256:test-fingerprint",
    sourceVersion: overrides.sourceVersion ?? 1,
    summary: overrides.summary ?? {
      added: 1,
      updated: 0,
      missing: 0,
      unchanged: 0,
    },
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    warnings: overrides.warnings ? [...overrides.warnings] : [],
    snapshotExpiresAt: overrides.snapshotExpiresAt ?? "2026-12-31T00:00:00.000Z",
    version: overrides.version ?? 1,
  };
}

export interface BuildMergeCandidateInput {
  readonly id?: string;
  readonly sourceChannelId?: string;
  readonly canonicalChannelId?: string | null;
  readonly method?: MergeCandidateVo["method"];
  readonly reasons?: readonly string[];
  readonly status?: MergeCandidateVo["status"];
  readonly sourceFingerprint?: string;
  readonly reviewedAt?: string | null;
  readonly reviewedBy?: string | null;
}

export function buildMergeCandidateVo(
  overrides: BuildMergeCandidateInput = {},
): MergeCandidateVo {
  return {
    id: overrides.id ?? UUID("c001"),
    sourceChannelId: overrides.sourceChannelId ?? fixtureSourceChannelId,
    canonicalChannelId: overrides.canonicalChannelId ?? null,
    method: overrides.method ?? "normalized_name",
    reasons: overrides.reasons ? [...overrides.reasons] : ["display-name-match"],
    status: overrides.status ?? "pending",
    sourceFingerprint: overrides.sourceFingerprint ?? "sha256:cand-fp-1",
    reviewedAt: overrides.reviewedAt ?? null,
    reviewedBy: overrides.reviewedBy ?? null,
  };
}

export interface BuildGrantInput {
  readonly id?: string;
  readonly displayName?: string;
  readonly deviceClientId?: string | null;
  readonly profile?: OutputGrantSummaryVo["profile"];
  readonly status?: OutputGrantSummaryVo["status"];
  readonly tokenPrefix?: string;
  readonly expiresAt?: string | null;
  readonly lastUsedAt?: string | null;
  readonly createdAt?: string;
  readonly revokedAt?: string | null;
  readonly playlistUrl?: string;
}

export function buildGrantIssuedVo(
  overrides: BuildGrantInput = {},
): OutputGrantIssuedVo {
  const grant: OutputGrantSummaryVo = {
    id: overrides.id ?? fixtureGrantId,
    displayName: overrides.displayName ?? "Living Room Player",
    deviceClientId: overrides.deviceClientId ?? null,
    profile: overrides.profile ?? "primary",
    status: overrides.status ?? "active",
    tokenPrefix: overrides.tokenPrefix ?? "mg_pl_aprefix",
    lastUsedAt: overrides.lastUsedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? "2026-08-07T22:00:00.000Z",
    revokedAt: overrides.revokedAt ?? null,
  };
  return {
    grant,
    playlistUrl:
      overrides.playlistUrl ??
      "https://magi.example.local/api/playlist/v2.m3u?grant=mg_pl_secrettoken",
  };
}

export interface BuildPublicationInput {
  readonly revision?: string;
  readonly status?: OutputPublicationVo["status"];
  readonly publishedAt?: string | null;
  readonly channelCount?: number;
  readonly playableChannelCount?: number;
  readonly excludedChannelCount?: number;
  readonly blockingReason?: string | null;
}

export function buildPublicationVo(
  overrides: BuildPublicationInput = {},
): OutputPublicationVo {
  return {
    revision: overrides.revision ?? "rev-20260807-1",
    status: overrides.status ?? "fresh",
    publishedAt: overrides.publishedAt ?? "2026-08-07T22:00:00.000Z",
    channelCount: overrides.channelCount ?? 12,
    playableChannelCount: overrides.playableChannelCount ?? 11,
    excludedChannelCount: overrides.excludedChannelCount ?? 1,
    blockingReason: overrides.blockingReason ?? null,
  };
}

export interface BuildObservationInput {
  readonly id?: string;
  readonly streamId?: string;
  readonly canonicalChannelId?: string;
  readonly source?: StreamHealthObservationVo["source"];
  readonly result?: StreamHealthObservationVo["result"];
  readonly errorClass?: string | null;
  readonly latencyMs?: number | null;
  readonly observedAt?: string;
  readonly taskId?: string | null;
  readonly deviceClientId?: string | null;
}

export function buildObservationVo(
  overrides: BuildObservationInput = {},
): StreamHealthObservationVo {
  return {
    id: overrides.id ?? UUID("d001"),
    streamId: overrides.streamId ?? fixtureStreamId,
    canonicalChannelId: overrides.canonicalChannelId ?? fixtureCanonicalChannelId,
    source: overrides.source ?? "active_probe",
    result: overrides.result ?? "failure",
    errorClass: overrides.errorClass ?? "http-502",
    latencyMs: overrides.latencyMs ?? null,
    observedAt: overrides.observedAt ?? "2026-08-07T22:00:00.000Z",
    taskId: overrides.taskId ?? null,
    deviceClientId: overrides.deviceClientId ?? null,
  };
}

export interface BuildFailoverEventInput {
  readonly id?: string;
  readonly canonicalChannelId?: string;
  readonly previousStreamId?: string | null;
  readonly nextStreamId?: string;
  readonly trigger?: FailoverEventVo["trigger"];
  readonly reason?: string;
  readonly observedAt?: string;
}

export function buildFailoverEventVo(
  overrides: BuildFailoverEventInput = {},
): FailoverEventVo {
  return {
    id: overrides.id ?? UUID("e001"),
    canonicalChannelId: overrides.canonicalChannelId ?? fixtureCanonicalChannelId,
    previousStreamId: overrides.previousStreamId ?? fixtureStreamId,
    nextStreamId: overrides.nextStreamId ?? UUID("e002"),
    trigger: overrides.trigger ?? "auto_failure_threshold",
    reason: overrides.reason ?? "consecutive-failures-3",
    observedAt: overrides.observedAt ?? "2026-08-07T22:01:00.000Z",
  };
}
