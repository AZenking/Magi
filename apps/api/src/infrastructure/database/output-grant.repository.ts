/**
 * Drizzle implementation of IOutputGrantRepository (T009, 009).
 *
 * Persists per-player / per-device output access grants. Plaintext tokens are
 * only ever returned from the create/rotate use case; this repository never
 * reads or stores the plaintext. `tokenHash` is the lookup key for the public
 * playlist guard.
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "./connection";
import { outputGrants } from "./schema";
import type { IOutputGrantRepository } from "@/domain/output-composition";
import type { OutputGrantSummaryVo } from "@magi/types";

function toVo(row: typeof outputGrants.$inferSelect): OutputGrantSummaryVo {
  return {
    id: row.id,
    displayName: row.displayName,
    deviceClientId: row.deviceClientId,
    profile: row.profile as OutputGrantSummaryVo["profile"],
    status: row.status as OutputGrantSummaryVo["status"],
    tokenPrefix: row.tokenPrefix,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class OutputGrantRepository implements IOutputGrantRepository {
  async list(input: {
    ownerUserId: string;
    status?: OutputGrantSummaryVo["status"];
  }): Promise<OutputGrantSummaryVo[]> {
    const clauses = [eq(outputGrants.ownerUserId, input.ownerUserId)];
    if (input.status) clauses.push(eq(outputGrants.status, input.status));
    const rows = await db
      .select()
      .from(outputGrants)
      .where(and(...clauses))
      .orderBy(outputGrants.createdAt);
    return rows.map(toVo);
  }

  async findById(id: string): Promise<OutputGrantSummaryVo | null> {
    const [row] = await db
      .select()
      .from(outputGrants)
      .where(eq(outputGrants.id, id))
      .limit(1);
    return row ? toVo(row) : null;
  }

  async findByOwnerAndId(
    ownerUserId: string,
    id: string,
  ): Promise<OutputGrantSummaryVo | null> {
    const [row] = await db
      .select()
      .from(outputGrants)
      .where(
        and(eq(outputGrants.id, id), eq(outputGrants.ownerUserId, ownerUserId)),
      )
      .limit(1);
    return row ? toVo(row) : null;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<OutputGrantSummaryVo | null> {
    const [row] = await db
      .select()
      .from(outputGrants)
      .where(eq(outputGrants.tokenHash, tokenHash))
      .limit(1);
    return row ? toVo(row) : null;
  }

  async create(input: {
    ownerUserId: string;
    displayName: string;
    deviceClientId: string | null;
    profile: OutputGrantSummaryVo["profile"];
    tokenPrefix: string;
    tokenHash: string;
    expiresAt: Date | null;
  }): Promise<OutputGrantSummaryVo> {
    const [row] = await db
      .insert(outputGrants)
      .values({
        ownerUserId: input.ownerUserId,
        displayName: input.displayName,
        deviceClientId: input.deviceClientId,
        profile: input.profile,
        status: "active",
        tokenPrefix: input.tokenPrefix,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    return toVo(row!);
  }

  async rotate(
    id: string,
    next: { tokenPrefix: string; tokenHash: string },
  ): Promise<OutputGrantSummaryVo | null> {
    const [row] = await db
      .update(outputGrants)
      .set({
        tokenPrefix: next.tokenPrefix,
        tokenHash: next.tokenHash,
        status: "active",
        revokedAt: null,
        revokedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(outputGrants.id, id))
      .returning();
    return row ? toVo(row) : null;
  }

  async revoke(
    id: string,
    reason: string | null,
  ): Promise<OutputGrantSummaryVo | null> {
    const [row] = await db
      .update(outputGrants)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(outputGrants.id, id))
      .returning();
    return row ? toVo(row) : null;
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await db
      .update(outputGrants)
      .set({ lastUsedAt: at })
      .where(eq(outputGrants.id, id));
  }

  /** Bulk-expire grants whose `expiresAt` is in the past. Used by cleanup. */
  async expireDue(now: Date): Promise<number> {
    const result = await db
      .update(outputGrants)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(outputGrants.status, "active"),
          isNotNull(outputGrants.expiresAt),
          lt(outputGrants.expiresAt, now),
        ),
      )
      .returning({ id: outputGrants.id });
    return result.length;
  }
}
