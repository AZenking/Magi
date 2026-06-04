import type { EpgSource } from "./epg.model";

export interface IEpgSourceRepository {
  findAll(): Promise<EpgSource[]>;
  findById(id: string): Promise<EpgSource | null>;
  create(data: Omit<EpgSource, "id" | "createdAt" | "updatedAt" | "lastSyncedAt">): Promise<EpgSource>;
  update(id: string, data: Partial<EpgSource>): Promise<EpgSource>;
  delete(id: string): Promise<boolean>;
  updateLastSynced(id: string): Promise<void>;
  findPaginated(params: {
    type?: string;
    search?: string;
    page: number;
    pageSize: number;
    sortBy: string;
    sortDir: "asc" | "desc";
  }): Promise<{ items: EpgSource[]; total: number }>;
  clearChannelBindings(sourceId: string): Promise<void>;
}
