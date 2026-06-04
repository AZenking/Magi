import type { Source, SourceRole, M3uSource, XmltvSource } from "./source.model";

export class SourceModel<T extends Source = Source> {
  constructor(protected readonly source: T) {}

  get id(): string {
    return this.source.id;
  }

  get enabled(): boolean {
    return this.source.enabled;
  }

  get role(): SourceRole {
    return this.source.role;
  }

  get failureCount(): number {
    return this.source.failureCount;
  }

  canBeSynced(): boolean {
    return this.source.enabled && !!this.source.url;
  }

  isStale(maxAgeMs: number): boolean {
    if (!this.source.lastSyncAt) return true;
    return Date.now() - this.source.lastSyncAt.getTime() > maxAgeMs;
  }

  isHealthy(): boolean {
    if (!this.source.enabled) return false;
    if (this.source.failureCount > 5) return false;
    if (this.source.lastSyncStatus === "failed") return false;
    return true;
  }

  shouldParticipateInOutput(): boolean {
    return this.source.enabled && this.source.participateInOutput;
  }

  isPrimary(): boolean {
    return this.source.role === "primary";
  }

  toObject(): T {
    return { ...this.source };
  }
}

export class M3uSourceModel extends SourceModel<M3uSource> {
  get type(): "m3u" {
    return "m3u";
  }
}

export class XmltvSourceModel extends SourceModel<XmltvSource> {
  get type(): "xmltv" {
    return "xmltv";
  }
}
