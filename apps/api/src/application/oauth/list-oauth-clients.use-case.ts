/**
 * ListOauthClientsUseCase — paginated client list for admin (004-safe-operations).
 * Never returns plaintext or hash (only the masked prefix).
 */
import { Inject, Injectable } from "@nestjs/common";
import { OAUTH_CLIENT_REPOSITORY, type IOauthClientRepository, type OauthClient } from "@/domain/oauth";

export interface ListOauthClientsArgs {
  page: number;
  pageSize: number;
  status?: "active" | "disabled" | "revoked";
  search?: string;
}

@Injectable()
export class ListOauthClientsUseCase {
  constructor(@Inject(OAUTH_CLIENT_REPOSITORY) private readonly repo: IOauthClientRepository) {}

  async execute(args: ListOauthClientsArgs): Promise<{ items: OauthClient[]; total: number }> {
    return this.repo.findPaginated(args);
  }
}
