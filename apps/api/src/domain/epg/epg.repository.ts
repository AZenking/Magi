import type { EpgSource } from "./epg.model";

export interface IEpgSourceRepository {
  findAll(): Promise<EpgSource[]>;
  findById(id: string): Promise<EpgSource | null>;
  create(data: Omit<EpgSource, "id" | "createdAt" | "updatedAt">): Promise<EpgSource>;
  update(id: string, data: Partial<EpgSource>): Promise<EpgSource>;
  delete(id: string): Promise<void>;
  updateLastSynced(id: string): Promise<void>;
}
