/**
 * TransitionOauthClientStatusUseCase — unified disable/enable/revoke handler
 * (004-safe-operations).
 *
 * Mirrors the former TransitionApiKeyStatusUseCase, with one critical addition:
 * on REVOKE, every access token for the client is batch-revoked so in-flight
 * devices lose access immediately. DISABLE only flips status (already-issued
 * tokens keep working until they naturally expire).
 *
 * Status machine (OauthClientModel.canTransitionTo):
 *   active ⇄ disabled, → revoked (terminal)
 */
import { Inject, Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import {
  OAUTH_CLIENT_REPOSITORY,
  ACCESS_TOKEN_REPOSITORY,
  type IOauthClientRepository,
  type IAccessTokenRepository,
  type OauthClient,
  type ClientStatus,
  OauthClientModel,
} from "@/domain/oauth";

export type TransitionTarget = "disabled" | "active" | "revoked";

@Injectable()
export class TransitionOauthClientStatusUseCase {
  constructor(
    @Inject(OAUTH_CLIENT_REPOSITORY) private readonly clientRepo: IOauthClientRepository,
    @Inject(ACCESS_TOKEN_REPOSITORY) private readonly tokenRepo: IAccessTokenRepository,
  ) {}

  async execute(id: string, target: TransitionTarget): Promise<OauthClient> {
    const client = await this.clientRepo.findById(id);
    if (!client) {
      throw new NotFoundException({ code: "resource-not-found" });
    }
    const model = new OauthClientModel(client);
    if (!model.canTransitionTo(target as ClientStatus)) {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: `无法从 ${client.status} 切换到 ${target}`,
        status: 409,
      });
    }

    const updated = await this.clientRepo.updateStatus(id, target as ClientStatus);
    if (!updated) {
      throw new NotFoundException({ code: "resource-not-found" });
    }

    // REVOKE: instantly invalidate every token for this client.
    // DISABLE: leave existing tokens alone (they expire naturally, but the
    // client cannot mint new ones — see IssueTokenUseCase status check).
    if (target === "revoked") {
      await this.tokenRepo.revokeByClientId(id);
    }

    return updated;
  }
}
