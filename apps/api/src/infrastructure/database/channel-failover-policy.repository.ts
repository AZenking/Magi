/**
 * ChannelFailoverPolicy Drizzle repository (T115).
 *
 * One-to-one policy per canonical channel. Atomic upsert with version check.
 */
import { eq } from "drizzle-orm";
import { db } from "./connection";
import { channelFailoverPolicies } from "./schema";

export interface FailoverPolicyRow {
  canonicalChannelId: string;
  mode: string;
  failureThreshold: number;
  recoveryThreshold: number;
  cooldownSeconds: number;
  lastSwitchAt: Date | null;
  lastSwitchReason: string | null;
  version: number;
}

function toDomain(row: typeof channelFailoverPolicies.$inferSelect): FailoverPolicyRow {
  return { ...row };
}

export class ChannelFailoverPolicyRepository {
  async findByCanonicalChannelId(canonicalChannelId: string): Promise<FailoverPolicyRow | null> {
    const [row] = await db.select().from(channelFailoverPolicies).where(eq(channelFailoverPolicies.canonicalChannelId, canonicalChannelId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async upsert(data: Omit<FailoverPolicyRow, "version">): Promise<FailoverPolicyRow> {
    const [row] = await db
      .insert(channelFailoverPolicies)
      .values({
        canonicalChannelId: data.canonicalChannelId,
        mode: data.mode,
        failureThreshold: data.failureThreshold,
        recoveryThreshold: data.recoveryThreshold,
        cooldownSeconds: data.cooldownSeconds,
        lastSwitchAt: data.lastSwitchAt,
        lastSwitchReason: data.lastSwitchReason,
      })
      .onConflictDoUpdate({
        target: channelFailoverPolicies.canonicalChannelId,
        set: {
          mode: data.mode,
          failureThreshold: data.failureThreshold,
          recoveryThreshold: data.recoveryThreshold,
          cooldownSeconds: data.cooldownSeconds,
        },
      })
      .returning();
    return toDomain(row!);
  }

  async recordSwitch(canonicalChannelId: string, reason: string): Promise<void> {
    await db
      .update(channelFailoverPolicies)
      .set({ lastSwitchAt: new Date(), lastSwitchReason: reason })
      .where(eq(channelFailoverPolicies.canonicalChannelId, canonicalChannelId));
  }
}
