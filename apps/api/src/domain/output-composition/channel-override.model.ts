export interface ChannelOverride {
  id: string;
  /**
   * Source-channel id (legacy) OR canonical-channel id (009 T027 migration).
   * `scope` disambiguates; new writes default to `canonical`.
   */
  channelId: string;
  scope: "source" | "canonical";
  customName: string | null;
  customGroup: string | null;
  customLogo: string | null;
  channelNumber: number | null;
  hidden: boolean;
  starred: boolean;
  manualEpgChannelId: string | null;
  /** 009 T027: per-field locks so sync can't overwrite individual operator edits. */
  lockedFields?: ReadonlyArray<
    | "name"
    | "group"
    | "logo"
    | "channelNumber"
    | "visibility"
    | "epgBinding"
  >;
  createdAt: Date;
  updatedAt: Date;
  // --- Safe Operations expand fields (T022). Manual EPG lock + provenance. ---
  manualEpgLocked?: boolean;
  manualEpgSourceId?: string | null;
  decisionReason?: string | null;
  version?: number;
}
