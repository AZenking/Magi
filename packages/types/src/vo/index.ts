export interface SourceVo {
  id: string;
  name: string;
  type: "m3u" | "xmltv";
  url: string;
  enabled: boolean;
  role: string;
  priority: number;
  participateInOutput: boolean;
  allowFallback: boolean;
  failureCount: number;
  lastSyncAt?: string;
  lastSyncStatus?: string | null;
  lastCheckAt?: string;
  checkStatus?: string | null;
  checkResponseTime?: number | null;
  checkError?: string | null;
  qualityScore?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use SourceVo instead */
export type EpgSourceVo = SourceVo;

export interface ChannelVo {
  id: string;
  channelIdentity: string;
  m3uSourceId: string | null;
  displayName: string;
  groupTitle: string | null;
  tvgId: string | null;
  tvgLogo: string | null;
  streamUrl: string | null;
  epgChannelId: string | null;
  epgMatchType: string | null;
  active: boolean;
  streamStatus: string | null;
  streamResponseTime: number | null;
  streamCheckedAt: string | null;
  streamError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalChannelVo {
  id: string;
  standardName: string;
  standardGroup: string | null;
  standardLogo: string | null;
  channelNumber: number | null;
  hidden: boolean;
  starred: boolean;
  epgChannelId: string | null;
  epgMatchType: string | null;
  epgStatus: string;
  outputStatus: string;
  primaryStreamId: string | null;
  createdAt: string;
  updatedAt: string;
  // --- Safe Operations (T057): lifecycle read model (contracts/channels.md).
  // Optional during the expand phase; present once the API maps them.
  lifecycle?: "active" | "hidden" | "disabled" | "trashed";
  lifecycleReason?: string | null;
  trashedAt?: string | null;
  purgeAfter?: string | null;
  version?: number;
  epgBinding?: EpgBindingVo | null;
}

export interface EpgBindingVo {
  xmltvSourceId: string | null;
  xmltvSourceName: string | null;
  xmltvChannelId: string | null;
  outputChannelId: string;
  status: "matched_manual" | "matched_auto" | "unmatched" | "conflict";
  matchType: string | null;
  locked: boolean;
  version: number;
  sourceStale: boolean;
}

export interface UpdateOutputChannel {
  standardName?: string | null;
  standardGroup?: string | null;
  standardLogo?: string | null;
  channelNumber?: number | null;
  hidden?: boolean;
  starred?: boolean;
  epgChannelId?: string | null;
}

export interface RawXmltvChannelVo {
  id: string;
  sourceId: string;
  xmltvId: string;
  displayName: string;
  icon: string | null;
}

export interface ChannelStreamVo {
  id: string;
  canonicalChannelId: string;
  m3uSourceId: string | null;
  rawChannelId: string | null;
  sourceChannelId: string | null;
  streamUrl: string;
  isPrimary: boolean;
  healthStatus: string;
  responseTime: number | null;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  streamError: string | null;
  streamCodec: string | null;
  streamFormat: string | null;
  streamWidth: number | null;
  streamHeight: number | null;
  streamFrameRate: number | null;
  streamBitrate: number | null;
  createdAt: string;
  m3uSourceName: string | null;
  sourceChannelName: string | null;
}

export interface CreateChannelStream {
  streamUrl: string;
  m3uSourceId?: string | null;
  sourceChannelId?: string | null;
}

export interface UpdateChannelStream {
  streamUrl?: string;
  m3uSourceId?: string | null;
  sourceChannelId?: string | null;
}

export interface OutputChannelDetailVo {
  channel: CanonicalChannelVo & { mergedFromIds: string | null };
  streams: ChannelStreamVo[];
}

export interface ProgrammeVo {
  id: string;
  sourceId: string;
  xmltvChannelId: string;
  title: string | null;
  subTitle: string | null;
  desc: string | null;
  category: string | null;
  startAt: string;
  stopAt: string;
  createdAt: string;
}

export type OutputGuideAnomaly =
  | "unmatched"
  | "conflict"
  | "source_stale"
  | "empty"
  | "gap"
  | "overlap";

export interface OutputGuideChannelVo {
  channel: CanonicalChannelVo;
  programmes: ProgrammeVo[];
  anomalies: OutputGuideAnomaly[];
}

export interface OutputGuideVo {
  items: OutputGuideChannelVo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  from: string;
  to: string;
}

export interface TaskJobDetailVo {
  state: string;
  attemptsMade: number;
  progress: number;
  failedReason: string | null;
  stacktrace: string[] | null;
  returnValue: unknown;
  processedOn: string | null;
  finishedOn: string | null;
  jobAvailable: boolean;
}

export interface TaskVo {
  id: string;
  sourceType: string;
  taskType: string;
  sourceId: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: number;
  currentStep: string | null;
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  queueName: string | null;
  jobId: string | null;
  attemptsMade: number;
  processedOn: string | null;
  jobDetail?: TaskJobDetailVo;
  createdAt: string;
}

// --- Open API (005-open-channels-epg-api) ---
// Read-only product-view projections served by /api/open/v1/*. These expose
// ONLY the public product fields (FR-012): never streamUrl, sourceId, health,
// or internal lifecycle. Channel `id` is the stable `magi:{canonicalId}` form.

/** Channel group with visible-channel count. */
export interface OpenGroupVo {
  name: string | null;
  count: number;
}

/** Product-view channel. `id` is `magi:{canonicalId}`. */
export interface OpenChannelVo {
  id: string;
  name: string;
  group: string | null;
  logo: string | null;
  channelNumber: number | null;
}

/** Product-view programme. `channelId` is `magi:{canonicalId}`. */
export interface OpenProgrammeVo {
  channelId: string;
  title: string | null;
  subTitle: string | null;
  startAt: string;
  stopAt: string;
  category: string | null;
}

/**
 * Playback decision for a channel (005-open-channels-epg-api playback endpoint).
 *
 * Unlike the channel list (FR-012 hides URLs), this IS the playback surface, so
 * line URLs are exposed — but ONLY the playable endpoint + format + health, never
 * sourceId/sourceName/admin fields. `primary` is the server-chosen best line;
 * `fallbacks` is the ordered rest for client-side failover (roadmap §10.3).
 */
export interface OpenPlaybackLineVo {
  streamId: string;
  url: string;
  format: string | null;
  health: string;
}

export interface OpenPlaybackVo {
  channelId: string;
  playable: boolean;
  primary: OpenPlaybackLineVo | null;
  fallbacks: OpenPlaybackLineVo[];
  /** When this decision should be re-fetched (ISO 8601). */
  decisionExpiresAt: string;
  /** "direct" = client connects upstream directly (roadmap §10.1 default). */
  deliveryMode: "direct";
}

/** API key list item — NEVER contains the plaintext key or hash (FR-003). */
export interface ApiKeyVo {
  id: string;
  name: string;
  keyPrefix: string;
  status: "active" | "disabled" | "revoked";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
}

/** API key creation result — the ONLY response that includes the plaintext key (FR-001). */
export interface ApiKeyCreatedVo extends ApiKeyVo {
  /** Plaintext key. Shown once; never retrievable again. */
  key: string;
}
