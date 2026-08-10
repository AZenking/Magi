/**
 * Adapter exposing the existing OperationLeaseRepository via the
 * IOperationLeasePort shape added in 009 (T010).
 *
 * The legacy repository uses (scopeKey, operationKind, taskId, changeSetId)
 * as its acquire input; the new port uses (scopeType, scopeId, holderId,
 * ttlSeconds). This adapter bridges the two so the 009 source-scoped job
 * flow can be tested without rewriting the existing lease semantics.
 */
import { Inject, Injectable } from "@nestjs/common";
import { OperationLeaseRepository } from "./operation-lease.repository";
import type { IOperationLeasePort } from "@/domain/task-execution";

@Injectable()
export class OperationLeaseAdapter implements IOperationLeasePort {
  private readonly holders = new Map<string, string>();

  constructor(
    @Inject(OperationLeaseRepository)
    private readonly repo: OperationLeaseRepository,
  ) {}

  async acquire(input: {
    scopeType: string;
    scopeId: string;
    holderId: string;
    ttlSeconds: number;
  }): Promise<{ acquired: boolean; leaseId: string | null }> {
    const scopeKey = `${input.scopeType}:${input.scopeId}`;
    const result = await this.repo.acquireOrReturnExisting(
      scopeKey,
      // Reuse the m3u_sync operation kind so existing dashboards keep working.
      "m3u_sync",
      input.holderId,
      null,
      input.ttlSeconds * 1000,
    );
    if (result.acquired) this.holders.set(scopeKey, input.holderId);
    return {
      acquired: result.acquired,
      // The legacy repo uses scopeKey as the primary identifier; return it so
      // callers can heartbeat/release deterministically.
      leaseId: result.acquired ? scopeKey : null,
    };
  }

  async heartbeat(leaseId: string, ttlSeconds: number): Promise<boolean> {
    void ttlSeconds;
    const holderId = this.holders.get(leaseId);
    if (!holderId) return false;
    return this.repo.heartbeat(leaseId, holderId);
  }

  async release(leaseId: string): Promise<void> {
    const holderId = this.holders.get(leaseId);
    if (!holderId) return;
    await this.repo.release(leaseId, holderId);
    this.holders.delete(leaseId);
  }
}
