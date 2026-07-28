/**
 * CanonicalChannelMember Drizzle repository (T035).
 *
 * Normalized membership connecting canonical channels to source channels by
 * stable identity (research §3, data-model.md). Replaces `mergedFromIds`.
 */
import { eq, and } from "drizzle-orm";
import { db } from "./connection";
import { canonicalChannelMembers } from "./schema";

export interface CanonicalMemberRow {
  id: string;
  canonicalChannelId: string;
  sourceChannelId: string;
  channelIdentity: string;
  membershipSource: string;
  active: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  version: number;
}

function toDomain(row: typeof canonicalChannelMembers.$inferSelect): CanonicalMemberRow {
  return { ...row };
}

export class CanonicalChannelMemberRepository {
  async findByCanonicalChannelId(canonicalChannelId: string): Promise<CanonicalMemberRow[]> {
    const rows = await db
      .select()
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.canonicalChannelId, canonicalChannelId));
    return rows.map(toDomain);
  }

  async findBySourceChannelId(sourceChannelId: string): Promise<CanonicalMemberRow[]> {
    const rows = await db
      .select()
      .from(canonicalChannelMembers)
      .where(eq(canonicalChannelMembers.sourceChannelId, sourceChannelId));
    return rows.map(toDomain);
  }

  /** Find the active membership for a source channel (unique per source). */
  async findActiveBySourceChannelId(sourceChannelId: string): Promise<CanonicalMemberRow | null> {
    const [row] = await db
      .select()
      .from(canonicalChannelMembers)
      .where(
        and(
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
          eq(canonicalChannelMembers.active, true),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  /** Add a membership (idempotent on canonical+source pair). */
  async upsert(data: {
    canonicalChannelId: string;
    sourceChannelId: string;
    channelIdentity: string;
    membershipSource: string;
  }): Promise<CanonicalMemberRow> {
    const [row] = await db
      .insert(canonicalChannelMembers)
      .values({
        canonicalChannelId: data.canonicalChannelId,
        sourceChannelId: data.sourceChannelId,
        channelIdentity: data.channelIdentity,
        membershipSource: data.membershipSource,
        active: true,
      })
      .onConflictDoUpdate({
        target: [canonicalChannelMembers.canonicalChannelId, canonicalChannelMembers.sourceChannelId],
        set: { active: true, leftAt: null },
      })
      .returning();
    return toDomain(row!);
  }

  /** Mark a membership inactive (source member can remain inactive). */
  async deactivate(canonicalChannelId: string, sourceChannelId: string): Promise<void> {
    await db
      .update(canonicalChannelMembers)
      .set({ active: false, leftAt: new Date() })
      .where(
        and(
          eq(canonicalChannelMembers.canonicalChannelId, canonicalChannelId),
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
        ),
      );
  }
}
