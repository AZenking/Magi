/**
 * CreateOauthClientUseCase — registers a new OAuth2 client (004-safe-operations).
 *
 * Generates a plaintext client_secret, persists only its SHA-256 hash + masked
 * prefix, and returns the plaintext ONCE. The plaintext is never retrievable.
 */
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { OAUTH_CLIENT_REPOSITORY, type IOauthClientRepository, type OauthClient } from "@/domain/oauth";
import { generateClientSecret, hashSecret, maskSecretPrefix } from "@/shared/crypto/secret-utils";

export interface CreateOauthClientCommand {
  clientId: string;
  clientName: string;
  createdBy: string;
}

export interface CreatedOauthClient {
  client: OauthClient;
  /** Plaintext secret — shown once, never persisted. */
  plaintextSecret: string;
}

@Injectable()
export class CreateOauthClientUseCase {
  constructor(@Inject(OAUTH_CLIENT_REPOSITORY) private readonly repo: IOauthClientRepository) {}

  async execute(command: CreateOauthClientCommand): Promise<CreatedOauthClient> {
    // Reject duplicate clientId (unique index would throw, but a clean 409 is better UX).
    const existing = await this.repo.findByClientId(command.clientId);
    if (existing) {
      throw new ConflictException({
        code: "client-id-taken",
        title: `clientId "${command.clientId}" already exists`,
        status: 409,
      });
    }

    const plaintextSecret = generateClientSecret();
    const client = await this.repo.create({
      clientId: command.clientId,
      clientName: command.clientName,
      secretHash: hashSecret(plaintextSecret),
      secretPrefix: maskSecretPrefix(plaintextSecret),
      status: "active",
      createdBy: command.createdBy,
    });
    return { client, plaintextSecret };
  }
}
