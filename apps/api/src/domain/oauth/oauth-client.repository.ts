/**
 * IOauthClientRepository (004-safe-operations).
 *
 * Infrastructure port (constitution III). The Drizzle implementation lives in
 * `infrastructure/database/oauth-client.repository.ts`. Use-cases depend on
 * this interface, never on Drizzle.
 */
import type { OauthClient, ClientStatus } from "./oauth-client.model";

/** NestJS DI token for the oauth-client repository. */
export const OAUTH_CLIENT_REPOSITORY = "OAUTH_CLIENT_REPOSITORY";

export interface CreateOauthClientInput {
  clientId: string;
  clientName: string;
  secretHash: string;
  secretPrefix: string;
  status?: ClientStatus;
  createdBy: string;
}

export interface ListOauthClientsQuery {
  page: number;
  pageSize: number;
  status?: ClientStatus;
  search?: string;
}

export interface IOauthClientRepository {
  create(data: CreateOauthClientInput): Promise<OauthClient>;
  findById(id: string): Promise<OauthClient | null>;
  /** Lookup by public clientId — used by the token endpoint. */
  findByClientId(clientId: string): Promise<OauthClient | null>;
  findPaginated(
    query: ListOauthClientsQuery,
  ): Promise<{ items: OauthClient[]; total: number }>;
  updateStatus(id: string, status: ClientStatus): Promise<OauthClient | null>;
  /** Bump lastUsedAt without changing status/version (best-effort). */
  touchLastUsed(id: string, at?: Date): Promise<void>;
  deleteById(id: string): Promise<boolean>;
}
