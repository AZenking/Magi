export type SourceType = "m3u" | "xmltv";
export type SourceRole = "primary" | "backup" | "supplement" | "test";
export type SyncStatus = "success" | "failed" | "running" | null;
export type CheckStatus = "online" | "offline" | "unknown" | null;

interface SourceBase {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string> | null;
  enabled: boolean;
  role: SourceRole;
  priority: number;
  participateInOutput: boolean;
  failureCount: number;
  lastSuccessAt: Date | null;
  qualityScore: number | null;
  lastSyncAt: Date | null;
  lastSyncStatus: SyncStatus;
  lastCheckAt: Date | null;
  checkStatus: CheckStatus;
  checkResponseTime: number | null;
  checkError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface M3uSource extends SourceBase {
  type: "m3u";
  allowFallback: boolean;
}

export interface XmltvSource extends SourceBase {
  type: "xmltv";
}

export type Source = M3uSource | XmltvSource;
