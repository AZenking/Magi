/**
 * DeleteApiKeyUseCase (005-open-channels-epg-api, US5/FR-004).
 *
 * Physical row removal. Any status is deletable (no transition check needed —
 * deletion is not a status transition).
 */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { API_KEY_REPOSITORY } from "../../shared/guards/api-key.guard";
import type { IApiKeyRepository } from "@/domain/api-key";

@Injectable()
export class DeleteApiKeyUseCase {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly repo: IApiKeyRepository) {}

  async execute(id: string): Promise<void> {
    const deleted = await this.repo.deleteById(id);
    if (!deleted) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
  }
}
