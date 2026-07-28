import type { M3uSource, XmltvSource } from "./source.model";

export type AnySource = M3uSource | XmltvSource;

export interface PaginatedSourcesResult<T extends AnySource> {
  items: T[];
  total: number;
}

export interface FindSourcesParams {
  search?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

type M3uCreateData = Omit<
  M3uSource,
  | "id"
  | "type"
  | "createdAt"
  | "updatedAt"
  | "failureCount"
  | "lastSuccessAt"
  | "qualityScore"
  | "lastSyncAt"
  | "lastSyncStatus"
  | "lastCheckAt"
  | "checkStatus"
  | "checkResponseTime"
  | "checkError"
>;

type XmltvCreateData = Omit<
  XmltvSource,
  | "id"
  | "type"
  | "createdAt"
  | "updatedAt"
  | "failureCount"
  | "lastSuccessAt"
  | "qualityScore"
  | "lastSyncAt"
  | "lastSyncStatus"
  | "lastCheckAt"
  | "checkStatus"
  | "checkResponseTime"
  | "checkError"
>;

export type M3uUpdateData = Partial<
  Pick<M3uSource, "name" | "url" | "headers" | "enabled" | "role" | "priority" | "participateInOutput" | "allowFallback">
>;

export type XmltvUpdateData = Partial<
  Pick<XmltvSource, "name" | "url" | "headers" | "enabled" | "role" | "priority" | "participateInOutput">
>;

export interface IM3uSourceRepository {
  findAll(): Promise<M3uSource[]>;
  findById(id: string): Promise<M3uSource | null>;
  findPaginated(params: FindSourcesParams): Promise<PaginatedSourcesResult<M3uSource>>;
  create(data: M3uCreateData): Promise<M3uSource>;
  update(id: string, data: M3uUpdateData): Promise<M3uSource | null>;
  delete(id: string): Promise<boolean>;
  updateSyncStatus(id: string, status: { lastSyncAt: Date; lastSyncStatus: string }): Promise<void>;
  // --- Safe Operations (T022): optimistic-concurrency config update. ---
  updateIfVersion(id: string, data: M3uUpdateData, expectedVersion: number): Promise<M3uSource | null>;
}

export interface IXmltvSourceRepository {
  findAll(): Promise<XmltvSource[]>;
  findById(id: string): Promise<XmltvSource | null>;
  findPaginated(params: FindSourcesParams): Promise<PaginatedSourcesResult<XmltvSource>>;
  create(data: XmltvCreateData): Promise<XmltvSource>;
  update(id: string, data: XmltvUpdateData): Promise<XmltvSource | null>;
  delete(id: string): Promise<boolean>;
  updateSyncStatus(id: string, status: { lastSyncAt: Date; lastSyncStatus: string }): Promise<void>;
  clearProgrammeBindings(sourceId: string): Promise<void>;
  // --- Safe Operations (T022): optimistic-concurrency config update. ---
  updateIfVersion(id: string, data: XmltvUpdateData, expectedVersion: number): Promise<XmltvSource | null>;
}
