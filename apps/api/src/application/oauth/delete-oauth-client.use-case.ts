/**
 * DeleteOauthClientUseCase — physical row removal (004-safe-operations).
 * The FK on oauth_access_tokens is ON DELETE CASCADE, so tokens are cleaned up
 * automatically by Postgres.
 */
import { Inject, Injectable } from "@nestjs/common";
import { OAUTH_CLIENT_REPOSITORY, type IOauthClientRepository } from "@/domain/oauth";

@Injectable()
export class DeleteOauthClientUseCase {
  constructor(@Inject(OAUTH_CLIENT_REPOSITORY) private readonly repo: IOauthClientRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.deleteById(id);
  }
}
