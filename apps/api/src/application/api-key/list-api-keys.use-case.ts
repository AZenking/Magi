/**
 * ListApiKeysUseCase (005-open-channels-epg-api, US1/FR-003).
 *
 * Paginated key listing. The repo rows already exclude the plaintext (only the
 * hash is persisted), and the projection to ApiKeyVo never emits keyHash.
 */
import { Inject, Injectable } from "@nestjs/common";
import { API_KEY_REPOSITORY } from "../../shared/guards/api-key.guard";
import type { IApiKeyRepository, ApiKeyStatus, ListApiKeysQuery } from "@/domain/api-key";

@Injectable()
export class ListApiKeysUseCase {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly repo: IApiKeyRepository) {}

  async execute(query: ListApiKeysQuery): Promise<{ items: ReturnType<typeof toVo>[]; total: number }> {
    const { items, total } = await this.repo.findPaginated(query);
    return { items: items.map(toVo), total };
  }
}

/** Strip keyHash; keep only display fields (FR-003). */
function toVo(key: {
  id: string;
  name: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    status: key.status,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
  };
}
