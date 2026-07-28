import type { AuditEvent } from "@/domain/audit";
import { db } from "./connection";
import { auditEvents, outboxEvents } from "./schema";

/**
 * Transactional audit + outbox writer.
 *
 * The audit row and its delivery notification are inseparable: either both
 * persist or neither does.
 */
export class AuditEventWriterRepository {
  async appendWithOutbox(
    data: Omit<AuditEvent, "id" | "occurredAt">,
  ): Promise<AuditEvent> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(auditEvents)
        .values({
          actorType: data.actorType,
          actorId: data.actorId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          displayName: data.displayName,
          result: data.result,
          requestId: data.requestId,
          taskId: data.taskId,
          parentTaskId: data.parentTaskId,
          changeSetId: data.changeSetId,
          recoveryPointId: data.recoveryPointId,
          summary: data.summary,
          reason: data.reason,
        })
        .returning();

      await tx.insert(outboxEvents).values({
        topic: `audit.${data.action}`,
        aggregateType: data.targetType,
        aggregateId: data.targetId,
        payload: { auditEventId: row!.id, result: data.result },
        requestId: data.requestId,
        taskId: data.taskId,
        status: "pending",
        attempts: 0,
        availableAt: new Date(),
      });

      return {
        ...data,
        id: row!.id,
        occurredAt: row!.occurredAt,
      };
    });
  }
}
