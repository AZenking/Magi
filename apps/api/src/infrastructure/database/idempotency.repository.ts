/**
 * Idempotency Drizzle repository (T024).
 *
 * Persistent idempotency for non-idempotent commands (data-model.md
 * IdempotencyRecord). Same actor+command+key+fingerprint returns the original
 * response; same key with a different fingerprint is rejected. Minimum and
 * default retention: 24h.
 */
import { eq, and, lte } from "drizzle-orm";
import { db } from "./connection";
import { idempotencyRecords } from "./schema";

export interface IdempotencyHit {
  responseStatus: number | null;
  responseRef: Record<string, unknown> | null;
  matchedFingerprint: boolean;
}

export class IdempotencyRepository {
  /**
   * Try to record a new idempotency entry. Returns:
   *   - `{ recorded: true }` if this is a fresh key+fingerprint.
   *   - `{ recorded: false, hit: { matchedFingerprint: true, ... } }` if the
   *     same key+fingerprint already exists (return the cached response).
   *   - `{ recorded: false, hit: { matchedFingerprint: false, ... } }` if the
   *     same key exists with a DIFFERENT fingerprint (caller rejects 409).
   */
  async tryRecord(params: {
    actorId: string;
    command: string;
    idempotencyKey: string;
    requestFingerprint: string;
    expiresAt: Date;
  }): Promise<{ recorded: true } | { recorded: false; hit: IdempotencyHit }> {
    // Insert-first with the unique key as the arbiter. A read-then-insert
    // sequence lets two concurrent retries both pass the read and one fail
    // with a raw unique-constraint error instead of deterministic replay.
    const [inserted] = await db
      .insert(idempotencyRecords)
      .values({
        actorId: params.actorId,
        command: params.command,
        idempotencyKey: params.idempotencyKey,
        requestFingerprint: params.requestFingerprint,
        expiresAt: params.expiresAt,
      })
      .onConflictDoNothing({
        target: [
          idempotencyRecords.actorId,
          idempotencyRecords.command,
          idempotencyRecords.idempotencyKey,
        ],
      })
      .returning({ id: idempotencyRecords.id });
    if (inserted) return { recorded: true };

    const existing = await this.find(
      params.actorId,
      params.command,
      params.idempotencyKey,
    );
    if (!existing) {
      // The row may have expired and been removed between the insert conflict
      // and the follow-up read. Treat this as a retryable conflict rather than
      // claiming a command was accepted without a durable record.
      return {
        recorded: false,
        hit: {
          responseStatus: null,
          responseRef: null,
          matchedFingerprint: false,
        },
      };
    }
    return {
      recorded: false,
      hit: {
        responseStatus: existing.responseStatus,
        responseRef: existing.responseRef as Record<string, unknown> | null,
        matchedFingerprint: existing.requestFingerprint === params.requestFingerprint,
      },
    };
  }

  /** Update the cached response once the command's TaskRef is known. */
  async saveResponse(
    actorId: string,
    command: string,
    idempotencyKey: string,
    responseStatus: number,
    responseRef: Record<string, unknown>,
  ): Promise<void> {
    await db
      .update(idempotencyRecords)
      .set({ responseStatus, responseRef })
      .where(
        and(
          eq(idempotencyRecords.actorId, actorId),
          eq(idempotencyRecords.command, command),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
        ),
      );
  }

  private async find(actorId: string, command: string, idempotencyKey: string) {
    const [row] = await db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.actorId, actorId),
          eq(idempotencyRecords.command, command),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Remove records past their expiry (cleanup job; never shortens the 24h floor). */
  async deleteExpired(now: Date): Promise<number> {
    const result = await db
      .delete(idempotencyRecords)
      .where(lte(idempotencyRecords.expiresAt, now))
      .returning();
    return result.length;
  }
}
