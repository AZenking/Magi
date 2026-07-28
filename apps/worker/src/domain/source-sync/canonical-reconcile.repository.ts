/**
 * Canonical reconciliation port (T038).
 *
 * Abstraction over canonical-channel membership + stream operations needed by
 * the incremental reconciliation use case. Implementations live in
 * infrastructure/ (Drizzle). The use case preserves overrides, lifecycle,
 * manual streams, primary stream and health history (FR-004, research §3).
 */
export interface CanonicalMemberInput {
  readonly sourceChannelId: string;
  readonly channelIdentity: string;
}

export interface ExistingCanonical {
  readonly canonicalChannelId: string;
  readonly sourceChannelId: string;
  readonly active: boolean;
}

export interface ICanonicalReconcileRepository {
  /** Find the active canonical membership for a source channel, if any. */
  findMembership(sourceChannelId: string): Promise<{ canonicalChannelId: string } | null>;

  /** Add or reactivate a membership link. */
  upsertMembership(canonicalChannelId: string, member: CanonicalMemberInput): Promise<void>;

  /** Create a new canonical channel for an unmerged source channel. */
  createCanonicalFromSource(sourceChannelId: string, displayName: string): Promise<{ canonicalChannelId: string }>;

  /** Deactivate a membership whose source channel has gone missing. */
  deactivateMembership(canonicalChannelId: string, sourceChannelId: string): Promise<void>;
}
