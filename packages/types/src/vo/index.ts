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

export interface TaskVo {
  id: string;
  sourceType: string;
  taskType: string;
  sourceId: string;
  status: "pending" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: number;
  currentStep: string | null;
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  createdAt: string;
}
