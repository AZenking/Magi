export interface ChannelOverride {
  id: string;
  channelId: string;
  customName: string | null;
  customGroup: string | null;
  customLogo: string | null;
  channelNumber: number | null;
  hidden: boolean;
  starred: boolean;
  manualEpgChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // --- Safe Operations expand fields (T022). Manual EPG lock + provenance. ---
  manualEpgLocked?: boolean;
  manualEpgSourceId?: string | null;
  decisionReason?: string | null;
  version?: number;
}
