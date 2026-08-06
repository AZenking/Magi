/**
 * DeleteOauthClientUseCase — physical row removal (004-safe-operations).
 * The FK on oauth_access_tokens is ON DELETE CASCADE, so tokens are cleaned up
 * automatically by Postgres.
 */
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OAUTH_CLIENT_REPOSITORY, type IOauthClientRepository } from "@/domain/oauth";

@Injectable()
export class DeleteOauthClientUseCase {
  constructor(@Inject(OAUTH_CLIENT_REPOSITORY) private readonly repo: IOauthClientRepository) {}

  async execute(id: string): Promise<void> {
    const client = await this.repo.findById(id);
    if (!client) throw new NotFoundException({ code: "resource-not-found" });
    if (client.clientKind === "public_device") {
      throw new ConflictException({
        code: "protected-client",
        title: "内置设备客户端不能物理删除",
        status: 409,
      });
    }
    const deleted = await this.repo.deleteById(id);
    if (!deleted) throw new NotFoundException({ code: "resource-not-found" });
  }
}
