/**
 * Drizzle adapter for ICanonicalReconcileRepository (008-pipeline-reliability T005).
 *
 * Provides canonical channel membership operations using channelIdentity (stable
 * string) as the membership key, so that canonical mappings survive channel UUID
 * changes during M3U re-sync.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { canonicalChannelMembers, canonicalChannels } from "../../schema";
import type { ICanonicalReconcileRepository, CanonicalMemberInput } from "@/domain/source-sync/canonical-reconcile.repository";

export class DrizzleCanonicalReconcileRepository implements ICanonicalReconcileRepository {
  async findMembership(sourceChannelId: string): Promise<{ canonicalChannelId: string } | null> {
    const rows = await db
      .select({ canonicalChannelId: canonicalChannelMembers.canonicalChannelId })
      .from(canonicalChannelMembers)
      .where(
        and(
          eq(canonicalChannelMembers.sourceChannelId, sourceChannelId),
          eq(canonicalChannelMembers.active, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertMembership(canonicalChannelId: string, member: CanonicalMemberInput): Promise<void> {
    await db
      .insert(canonicalChannelMembers)
      .values({
        canonicalChannelId,
        sourceChannelId: member.sourceChannelId,
        channelIdentity: member.channelIdentity,
        membershipSource: "automatic",
        active: true,
        joinedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [canonicalChannelMembers.canonicalChannelId, canonicalChannelMembers.sourceChannelId],
        set: {
          active: true,
          leftAt: null,
          channelIdentity: member.channelIdentity,
        },
      });
  }

  async createCanonicalFromSource(sourceChannelId: string, displayName: string): Promise<{ canonicalChannelId: string }> {
    const [row] = await db
      .insert(canonicalChannels)
      .values({
        standardName: displayName,
        outputStatus: "active",
      })
      .returning({ id: canonicalChannels.id });
    return { canonicalChannelId: row!.id };
  }

  async deactivateMembership(canonicalChannelId: string, sourceChannelId: string): Promise<void> {
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
