export interface EpgSource {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EpgSourceModel {
  constructor(private readonly source: EpgSource) {}

  canBeSynced(): boolean {
    return this.source.enabled && !!this.source.url;
  }

  isStale(maxAgeMs: number): boolean {
    if (!this.source.lastSyncedAt) return true;
    return Date.now() - this.source.lastSyncedAt.getTime() > maxAgeMs;
  }
}
