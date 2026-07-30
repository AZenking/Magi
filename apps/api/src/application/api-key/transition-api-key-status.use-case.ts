/**
 * TransitionApiKeyStatusUseCase (005-open-channels-epg-api, US5/FR-004).
 *
 * Unified disable/enable/revoke handler. Validates the status machine via
 * ApiKeyModel.canTransitionTo; throws ConflictException (→ 409
 * invalid-state-transition) on illegal transitions. `revoked` is terminal.
 */
import { Inject, Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { API_KEY_REPOSITORY } from "../../shared/guards/api-key.guard";
import type { IApiKeyRepository, ApiKey } from "@/domain/api-key";
import { ApiKeyModel } from "@/domain/api-key";

export type TransitionTarget = "disabled" | "active" | "revoked";

@Injectable()
export class TransitionApiKeyStatusUseCase {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly repo: IApiKeyRepository) {}

  async execute(id: string, target: TransitionTarget): Promise<ApiKey> {
    const key = await this.repo.findById(id);
    if (!key) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
    const model = new ApiKeyModel(key);
    if (!model.canTransitionTo(target)) {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `无法从 ${key.status} 切换到 ${target}`,
        status: 409,
      });
    }
    const updated = await this.repo.updateStatus(id, target);
    if (!updated) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
    return updated;
  }
}
