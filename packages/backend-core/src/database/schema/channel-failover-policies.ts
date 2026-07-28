/**
 * ChannelFailoverPolicy (T018).
 *
 * One-to-one failover policy for a canonical channel (research §11,
 * data-model.md). `manual_only` is the safe default during migration.
 */
import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const channelFailoverPolicies = pgTable(
  "channel_failover_policies",
  {
    canonicalChannelId: uuid("canonical_channel_id").primaryKey(),
    mode: varchar("mode", { length: 30 }).notNull().default("manual_only"),
    failureThreshold: integer("failure_threshold").notNull().default(3),
    recoveryThreshold: integer("recovery_threshold").notNull().default(2),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
    lastSwitchAt: timestamp("last_switch_at", { withTimezone: true }),
    lastSwitchReason: varchar("last_switch_reason", { length: 500 }),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("failover_policy_canonical_idx").on(t.canonicalChannelId)],
);
