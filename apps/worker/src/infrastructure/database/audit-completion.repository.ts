import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { auditEvents, outboxEvents } from "../../schema";

type CompletionResult = "succeeded" | "failed" | "cancelled" | "skipped";

function redactReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return reason
    .slice(0, 500)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /(api_key|token|password|secret|access_token|refresh_token)=[^&\s]*/gi,
      "$1=[redacted]",
    );
}

/**
 * Closes an already-audited asynchronous command.
 *
 * Scheduled/automatic jobs which have no accepted audit event are deliberately
 * ignored, keeping routine probes out of the audit log. The existence check
 * also makes QueueEvents redelivery idempotent.
 */
export class AuditCompletionRepository {
  async appendForTrackedTask(input: {
    taskId: string;
    result: CompletionResult;
    summary?: Record<string, unknown>;
    reason?: string | null;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      // Serialize completion writes for a task. QueueEvents delivery is
      // at-least-once and completed/failed listeners may race during recovery.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.taskId}))`,
      );
      const [accepted] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.taskId, input.taskId),
            eq(auditEvents.result, "accepted"),
          ),
        )
        .orderBy(desc(auditEvents.occurredAt))
        .limit(1);
      if (!accepted) return;

      const [existing] = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.taskId, input.taskId),
            ne(auditEvents.result, "accepted"),
          ),
        )
        .limit(1);
      if (existing) return;

      const [event] = await tx
        .insert(auditEvents)
        .values({
          actorType: accepted.actorType,
          actorId: accepted.actorId,
          action: accepted.action,
          targetType: accepted.targetType,
          targetId: accepted.targetId,
          displayName: accepted.displayName,
          result: input.result,
          requestId: accepted.requestId,
          taskId: accepted.taskId,
          parentTaskId: accepted.parentTaskId,
          changeSetId: accepted.changeSetId,
          recoveryPointId: accepted.recoveryPointId,
          summary: input.summary ?? null,
          reason: redactReason(input.reason),
        })
        .returning({ id: auditEvents.id });

      await tx.insert(outboxEvents).values({
        topic: `audit.${accepted.action}`,
        aggregateType: accepted.targetType,
        aggregateId: accepted.targetId,
        payload: { auditEventId: event!.id, result: input.result },
        requestId: accepted.requestId,
        taskId: accepted.taskId,
        status: "pending",
        attempts: 0,
        availableAt: new Date(),
      });
    });
  }
}
