/**
 * Diff engine (T013).
 *
 * Pure classification of source snapshot vs. current operator state into
 * reviewable change items. Core rules (research §2, §4; FR-003/FR-004/SC-001):
 *
 *   - new identity in snapshot, not in current        => add
 *   - existing identity, automatic field changed       => update
 *   - identity in current, absent from snapshot        => mark_missing
 *   - manual field present                              => preserve (never overwrite)
 *   - duplicate channelIdentity within one snapshot     => conflict (both, unselected)
 *
 * No I/O. The worker / API layers attach itemOrder, ids and decision state
 * around this pure output.
 */
import type { ChangeItem, ChangeSummary, CurrentChannelState, SnapshotItem } from "./types";

/** Manual operator fields that always win over automatic source facts. */
const MANUAL_FIELDS = [
  "manualName",
  "manualGroup",
  "manualLogo",
  "manualChannelNumber",
] as const;

/**
 * Compute change items for a snapshot vs. current state.
 *
 * @param snapshot immutable source facts (from SourceImportSnapshotItem)
 * @param current  current operator-visible channel states keyed by identity
 */
export function computeChangeItems(
  snapshot: readonly SnapshotItem[],
  current: readonly CurrentChannelState[],
): ChangeItem[] {
  const currentByIdentity = new Map<string, CurrentChannelState>();
  for (const c of current) currentByIdentity.set(c.channelIdentity, c);

  // Detect duplicate identities inside the snapshot (collision groups).
  const identityCounts = new Map<string, number>();
  for (const item of snapshot) {
    identityCounts.set(item.channelIdentity, (identityCounts.get(item.channelIdentity) ?? 0) + 1);
  }

  const items: ChangeItem[] = [];
  const seenIdentities = new Set<string>();

  for (const snapItem of snapshot) {
    const identity = snapItem.channelIdentity;
    seenIdentities.add(identity);
    const isDuplicate = (identityCounts.get(identity) ?? 0) > 1;

    if (isDuplicate) {
      items.push({
        channelIdentity: identity,
        action: "conflict",
        selected: false,
        reasonCode: "duplicate-identity-in-snapshot",
        classification: "conflict",
      });
      continue;
    }

    const existing = currentByIdentity.get(identity);
    if (!existing) {
      items.push({
        channelIdentity: identity,
        action: "add",
        selected: true,
        after: snapItem.payload,
      });
      continue;
    }

    // Existing identity — classify by what changed, respecting manual fields.
    const result = classifyExisting(snapItem, existing);
    items.push(result);
  }

  // Identities present in current but absent from snapshot => mark_missing.
  for (const c of current) {
    if (!seenIdentities.has(c.channelIdentity)) {
      items.push({
        channelIdentity: c.channelIdentity,
        action: "mark_missing",
        selected: false,
        reasonCode: "source-identity-disappeared",
        before: { lifecycle: c.lifecycle },
      });
    }
  }

  return items;
}

function classifyExisting(
  snapItem: SnapshotItem,
  existing: CurrentChannelState,
): ChangeItem {
  const snapName = readString(snapItem.payload, "name");
  const hasAnyManual = MANUAL_FIELDS.some((f) => readOptional(existing, f) != null);

  // Manual EPG lock: source candidate must not overwrite a locked binding.
  if (existing.manualEpgLocked && snapItem.payload.epgChannelId != null) {
    return preserve(snapItem.channelIdentity, "manual-epg-locked");
  }

  // Manual name present: source name change is preserved, not applied.
  if (existing.manualName != null && snapName != null && snapName !== existing.manualName) {
    return preserve(snapItem.channelIdentity, "manual-name-protected");
  }

  // Automatic name changed and no manual override on that field.
  if (
    snapName != null &&
    snapName !== existing.automaticName &&
    existing.manualName == null
  ) {
    return {
      channelIdentity: snapItem.channelIdentity,
      action: "update",
      selected: true,
      changedFields: ["name"],
      before: { name: existing.automaticName },
      after: { name: snapName },
    };
  }

  // No meaningful change — but if there are other manual fields, surface a
  // preserve so the reviewer sees operator state is being kept.
  if (hasAnyManual) {
    return preserve(snapItem.channelIdentity, "manual-fields-protected");
  }

  // Truly unchanged.
  return {
    channelIdentity: snapItem.channelIdentity,
    action: "preserve",
    selected: false,
    reasonCode: "no-change",
    changedFields: [],
  };
}

function preserve(identity: string, reason: string): ChangeItem {
  return {
    channelIdentity: identity,
    action: "preserve",
    selected: false,
    reasonCode: reason,
    changedFields: [],
  };
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

function readOptional(obj: Record<string, unknown>, key: string): unknown {
  return obj[key];
}

/** Aggregate change items into an exhaustive, non-overlapping summary. */
export function summarize(items: readonly ChangeItem[]): ChangeSummary {
  const counts = {
    added: 0,
    updated: 0,
    missing: 0,
    deleted: 0,
    preserved: 0,
    conflicts: 0,
    unmatched: 0,
  };
  for (const item of items) {
    switch (item.action) {
      case "add":
        counts.added++;
        break;
      case "update":
        counts.updated++;
        break;
      case "mark_missing":
        counts.missing++;
        break;
      case "delete":
        counts.deleted++;
        break;
      case "preserve":
        counts.preserved++;
        break;
      case "conflict":
        counts.conflicts++;
        break;
      case "unbind":
        counts.unmatched++;
        break;
      // lifecycle / bind / restore are not summarized into counts here;
      // operation-specific summaries extend this baseline when needed.
      default:
        break;
    }
  }
  return counts;
}
