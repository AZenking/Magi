/**
 * Operation-diff domain types (T013).
 *
 * Pure, framework-agnostic shapes consumed by fingerprint.ts and diff-engine.ts.
 * These intentionally mirror (a subset of) `@magi/types` enums so the wire
 * layer maps 1:1, but this package must NOT import from `@magi/types` — it is
 * a lower-level shared algorithm (constitution II/III).
 */

/** A normalized item from an immutable source snapshot (data-model.md SourceImportSnapshotItem). */
export interface SnapshotItem {
  readonly channelIdentity: string;
  readonly collisionOrdinal?: number;
  readonly payload: Record<string, unknown>;
}

/** The current operator-visible state of a channel row. */
export interface CurrentChannelState {
  readonly channelIdentity: string;
  readonly automaticName: string | null;
  readonly manualName: string | null;
  readonly manualGroup: string | null;
  readonly manualLogo?: string | null;
  readonly manualChannelNumber?: string | null;
  readonly lifecycle: "active" | "hidden" | "disabled" | "trashed";
  readonly manualEpgLocked: boolean;
  readonly primaryStreamId: string | null;
  readonly [extra: string]: unknown;
}

/** A classified, per-target change to be reviewed and (optionally) applied. */
export interface ChangeItem {
  readonly channelIdentity: string;
  readonly action:
    | "add"
    | "update"
    | "mark_missing"
    | "lifecycle"
    | "bind"
    | "unbind"
    | "delete"
    | "restore"
    | "preserve"
    | "conflict";
  readonly selected: boolean;
  readonly changedFields?: readonly string[];
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
  readonly reasonCode?: string;
  readonly classification?: string;
}

/** Aggregate counts for a change set summary. */
export interface ChangeSummary {
  readonly added: number;
  readonly updated: number;
  readonly missing: number;
  readonly deleted: number;
  readonly preserved: number;
  readonly conflicts: number;
  readonly unmatched: number;
}
