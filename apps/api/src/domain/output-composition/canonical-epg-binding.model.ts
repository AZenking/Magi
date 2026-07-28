export type CanonicalEpgBindingStatus =
  | "matched_manual"
  | "matched_auto"
  | "unmatched"
  | "conflict";

export interface CanonicalEpgBinding {
  canonicalChannelId: string;
  xmltvSourceId: string | null;
  xmltvChannelId: string | null;
  status: CanonicalEpgBindingStatus;
  matchType: string | null;
  locked: boolean;
  decisionReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalEpgBindingWithSource extends CanonicalEpgBinding {
  xmltvSourceName: string | null;
  sourceEnabled: boolean | null;
  sourceLastSyncAt: Date | null;
  sourceFreshnessThresholdMinutes: number | null;
}
