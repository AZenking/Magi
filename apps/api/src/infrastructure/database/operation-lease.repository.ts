/**
 * OperationLease Drizzle repository (T024).
 *
 * Persistent business mutex (data-model.md OperationLease). Acquisition is
 * atomic via upsert-with-conflict-target; an expired lease is reclaimed only
 * after confirming its referenced task is not active.
 */
import { eq, and, lte } from "drizzle-orm";
import type { IOperationLeaseRepository } from "@/domain/operation-safety";
import type { OperationKind } from "@magi/types";
import { db } from "./connection";
import { operationLeases } from "./schema";

export class OperationLeaseRepository implements IOperationLeaseRepository {
  async acquireOrReturnExisting(
    scopeKey: string,
    operationKind: OperationKind,
    taskId: string,
    changeSetId: string | null,
    ttlMs: number,
  ): Promise<{ acquired: boolean; ownerTaskId: string | null }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    // Atomic insert-or-return-existing via ON CONFLICT on the scopeKey PK.
    const [row] = await db
      .insert(operationLeases)
      .values({
        scopeKey,
        operationKind,
        taskId,
        changeSetId,
        acquiredAt: now,
        expiresAt,
        heartbeatAt: now,
      })
      .onConflictDoNothing({ target: operationLeases.scopeKey })
      .returning();
    if (row) return { acquired: true, ownerTaskId: null };
    // Conflict: an existing lease holds this scope. Return its owner (caller
    // decides whether it is expired/reclaimable — see reclaimIfExpired).
    const [existing] = await db
      .select()
      .from(operationLeases)
      .where(eq(operationLeases.scopeKey, scopeKey))
      .limit(1);
    return { acquired: false, ownerTaskId: existing?.taskId ?? null };
  }

  async heartbeat(scopeKey: string, taskId: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2-minute TTL
    const [row] = await db
      .update(operationLeases)
      .set({ heartbeatAt: now, expiresAt })
      .where(
        and(
          eq(operationLeases.scopeKey, scopeKey),
          eq(operationLeases.taskId, taskId),
        ),
      )
      .returning();
    return !!row;
  }

  async release(scopeKey: string, taskId: string): Promise<boolean> {
    const result = await db
      .delete(operationLeases)
      .where(
        and(
          eq(operationLeases.scopeKey, scopeKey),
          eq(operationLeases.taskId, taskId),
        ),
      )
      .returning({ scopeKey: operationLeases.scopeKey });
    return result.length > 0;
  }

  async reclaimIfExpired(scopeKey: string, now: Date): Promise<boolean> {
    // Delete only if past expiresAt. The "active task" check is the caller's
    // responsibility (T041) — it confirms the referenced task is not active
    // before invoking this; here we only assert the TTL has elapsed.
    const result = await db
      .delete(operationLeases)
      .where(
        and(
          eq(operationLeases.scopeKey, scopeKey),
          lte(operationLeases.expiresAt, now),
        ),
      )
      .returning();
    return result.length > 0;
  }
}
