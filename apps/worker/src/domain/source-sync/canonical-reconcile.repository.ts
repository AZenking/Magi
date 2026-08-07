/**
 * Canonical reconciliation port (T038; 009-m3u-control-plane extends with
 * same-tvg-id auto-merge lookup, weak-match candidate creation and rejected-
 * candidate suppression).
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

/**
 * Source channel snapshot consumed by reconcile (009 T025).
 * `tvgId` is the raw upstream value; the use case normalizes it before
 * deciding auto-merge vs candidate.
 */
export interface ReconcileSourceChannelInput {
  readonly sourceChannelId: string;
  readonly channelIdentity: string;
  readonly displayName: string;
  readonly groupTitle: string | null;
  readonly tvgId: string | null;
  readonly normalizedName: string | null;
  readonly normalizedGroup: string | null;
  readonly streamUrl: string | null;
  readonly sourceFingerprint: string;
}

/** Weak-match candidate shape passed to the repository for persistence. */
export interface WeakMatchCandidateInput {
  readonly sourceChannelId: string;
  readonly canonicalChannelId: string;
  readonly method: "normalized_name" | "normalized_name_group";
  readonly reasons: readonly string[];
  readonly sourceFingerprint: string;
  readonly suppressionKey: string;
  readonly confidence: number;
}

export interface ICanonicalReconcileRepository {
  /** Find the active canonical membership for a source channel, if any. */
  findMembership(sourceChannelId: string): Promise<{ canonicalChannelId: string } | null>;

  /** Add or reactivate a membership link. */
  upsertMembership(
    canonicalChannelId: string,
    member: CanonicalMemberInput,
    source?: "automatic" | "manual" | "migrated",
  ): Promise<void>;

  /** Create a new canonical channel for an unmerged source channel. */
  createCanonicalFromSource(sourceChannelId: string, displayName: string): Promise<{ canonicalChannelId: string }>;

  /** Deactivate a membership whose source channel has gone missing. */
  deactivateMembership(canonicalChannelId: string, sourceChannelId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // 009-m3u-control-plane additions (T025).
  // -------------------------------------------------------------------------

  /**
   * Find an existing canonical channel by normalized tvg-id. Returns null when
   * no canonical has that tvg-id yet (or when the supplied tvg-id is null).
   */
  findCanonicalByNormalizedTvgId(
    normalizedTvgId: string,
  ): Promise<{ canonicalChannelId: string } | null>;

  /** Insert a weak-match candidate for operator review. */
  insertWeakMatchCandidate(input: WeakMatchCandidateInput): Promise<void>;

  /** Return true if a candidate with this suppression key was rejected before. */
  isCandidateSuppressed(suppressionKey: string): Promise<boolean>;

  /** Return all canonical channels with their normalized name/group (for weak-match). */
  listCanonicalsForWeakMatch(): Promise<
    ReadonlyArray<{
      canonicalChannelId: string;
      normalizedName: string | null;
      normalizedGroup: string | null;
      memberSourceChannelIds: ReadonlyArray<string>;
    }>
  >;
}
