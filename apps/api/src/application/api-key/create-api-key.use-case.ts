/**
 * CreateApiKeyUseCase (005-open-channels-epg-api, US1/FR-001/FR-002).
 *
 * Generates a plaintext key, persists only its SHA-256 hash + masked prefix,
 * and returns the plaintext ONCE. The plaintext is never stored and never
 * retrievable again (data-model.md D3).
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  API_KEY_REPOSITORY,
  generateApiKeyPlaintext,
  hashApiKey,
  maskKeyPrefix,
} from "../../shared/guards/api-key.guard";
import type { IApiKeyRepository, ApiKey } from "@/domain/api-key";

export interface CreateApiKeyCommand {
  name: string;
  expiresAt?: Date | null;
  createdBy: string;
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  /** Plaintext — shown once, never persisted. */
  plaintext: string;
}

@Injectable()
export class CreateApiKeyUseCase {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly repo: IApiKeyRepository) {}

  async execute(command: CreateApiKeyCommand): Promise<CreatedApiKey> {
    const plaintext = generateApiKeyPlaintext();
    const apiKey = await this.repo.create({
      name: command.name,
      keyHash: hashApiKey(plaintext),
      keyPrefix: maskKeyPrefix(plaintext),
      status: "active",
      expiresAt: command.expiresAt ?? null,
      createdBy: command.createdBy,
    });
    return { apiKey, plaintext };
  }
}
