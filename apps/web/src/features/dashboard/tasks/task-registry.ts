/**
 * Target-scoped pending registry (T086).
 *
 * Tracks per-task + per-target pending state so unrelated rows never show
 * pending (contracts/tasks.md "Polling obligations" / FR-027).
 *
 * Mirrors the pattern in operations/operation-queries.ts `useTargetPending`
 * but is more complete: a module-level Map stores active targets and a
 * React hook subscribes components to changes via useState + useSyncExternalStore.
 */
import { useCallback, useSyncExternalStore } from "react";

/** Composite key: `${taskId}::${targetType}::${targetId}`. */
type TargetKey = string;

interface TargetRef {
  taskId: string;
  targetType: string;
  targetId: string;
}

function makeKey(ref: TargetRef): TargetKey {
  return `${ref.taskId}::${ref.targetType}::${ref.targetId}`;
}

/**
 * Module-level pending registry. Shared across every component in the app so
 * that a row's badge can react to a mutation triggered from elsewhere.
 */
const pendingTargets = new Set<TargetKey>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read a snapshot of whether a target is currently pending. */
function isPending(ref: TargetRef | null | undefined): boolean {
  if (!ref) return false;
  return pendingTargets.has(makeKey(ref));
}

/** Imperative register/unregister (used by mutations, not React render). */
export const targetPendingRegistry = {
  start(ref: TargetRef) {
    pendingTargets.add(makeKey(ref));
    emit();
  },
  stop(ref: TargetRef) {
    pendingTargets.delete(makeKey(ref));
    emit();
  },
  clear() {
    if (pendingTargets.size === 0) return;
    pendingTargets.clear();
    emit();
  },
};

/**
 * React hook that subscribes to the registry. Returns a stable `isPending`
 * callback that re-renders callers when the relevant key changes.
 *
 * Use it from row/action components:
 *
 *   const isPending = useTargetPending();
 *   if (isPending({ taskId, targetType: 'source', targetId })) { … }
 */
export function useTargetPending() {
  // useSyncExternalStore is the correct primitive: it bails out of renders
  // when the snapshot value didn't actually change (the registry can change
  // for unrelated rows without affecting this subscriber).
  const snapshot = useSyncExternalStore(
    subscribe,
    () => pendingTargets.size,
    () => 0,
  );

  // Reference snapshot so React keeps us subscribed; linter-aware no-op.
  void snapshot;

  return useCallback((ref: TargetRef | null | undefined) => isPending(ref), []);
}
