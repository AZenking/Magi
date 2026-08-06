import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  OAUTH_CLIENT_REPOSITORY,
  type IOauthClientRepository,
} from "@/domain/oauth";
import {
  generateClientSecret,
  hashSecret,
  maskSecretPrefix,
} from "@/shared/crypto/secret-utils";

@Injectable()
export class RotateOauthClientSecretUseCase {
  constructor(
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly repo: IOauthClientRepository,
  ) {}

  async execute(id: string) {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundException({ code: "resource-not-found" });
    if (current.clientKind !== "confidential") {
      throw new ConflictException({
        code: "public-client-no-secret",
        title: "设备客户端不使用 Secret",
        status: 409,
      });
    }
    const plaintextSecret = generateClientSecret();
    const updated = await this.repo.rotateSecret(
      id,
      hashSecret(plaintextSecret),
      maskSecretPrefix(plaintextSecret),
    );
    if (!updated) throw new NotFoundException({ code: "resource-not-found" });
    return { client: updated, plaintextSecret };
  }
}
