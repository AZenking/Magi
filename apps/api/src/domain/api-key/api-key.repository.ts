/**
 * IApiKeyRepository (005-open-channels-epg-api).
 *
 * Infrastructure port (constitution III). The Drizzle implementation lives in
 * `infrastructure/database/api-key.repository.ts`. Use-cases depend on this
 * interface, never on Drizzle.
 */
import type { ApiKey, ApiKeyStatus } from "./api-key.model";

export interface CreateApiKeyInput {
  name: string;
  keyHash: string;
  keyPrefix: string;
  status?: ApiKeyStatus;
  expiresAt?: Date | null;
  scopes?: unknown;
  createdBy: string;
}

export interface ListApiKeysQuery {
  page: number;
  pageSize: number;
  status?: ApiKeyStatus;
  search?: string;
}

export interface IApiKeyRepository {
  create(data: CreateApiKeyInput): Promise<ApiKey>;
  findById(id: string): Promise<ApiKey | null>;
  /** Lookup by hash, returning ONLY active+usable keys (the guard's hot path). */
  findActiveByHash(keyHash: string): Promise<ApiKey | null>;
  findPaginated(query: ListApiKeysQuery): Promise<{ items: ApiKey[]; total: number }>;
  updateStatus(id: string, status: ApiKeyStatus): Promise<ApiKey | null>;
  /** Bump lastUsedAt without changing status/version (best-effort). */
  touchLastUsed(id: string, at?: Date): Promise<void>;
  deleteById(id: string): Promise<boolean>;
}
