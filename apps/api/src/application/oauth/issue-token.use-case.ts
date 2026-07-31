/**
 * IssueTokenUseCase — handles the OAuth2 Client Credentials Grant token
 * endpoint (004-safe-operations).
 *
 * Validates the client_id + client_secret, checks the client status (active =
 * can mint tokens), generates a stateful access token, persists its hash, and
 * returns the plaintext token + expiry.
 *
 * Error classification (distinct codes so the TV client can show the right
 * message — e.g. "设备已被禁用" vs "凭证无效"):
 *   - client not found OR secret mismatch → invalid-client (401)
 *   - client disabled                     → client-disabled (401)
 *   - client revoked                      → client-revoked (401)
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  OAUTH_CLIENT_REPOSITORY,
  ACCESS_TOKEN_REPOSITORY,
  type IOauthClientRepository,
  type IAccessTokenRepository,
} from "@/domain/oauth";
import {
  hashSecret,
  generateAccessToken,
  maskSecretPrefix,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/shared/crypto/secret-utils";
import {
  DEVICE_CLIENT_CONFIG,
  isLegacyClientCutover,
} from "../../infrastructure/config/device-client.config";

export interface IssueTokenCommand {
  clientId: string;
  clientSecret: string;
}

export interface IssuedToken {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

@Injectable()
export class IssueTokenUseCase {
  constructor(
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly clientRepo: IOauthClientRepository,
    @Inject(ACCESS_TOKEN_REPOSITORY)
    private readonly tokenRepo: IAccessTokenRepository,
  ) {}

  async execute(command: IssueTokenCommand): Promise<IssuedToken> {
    const client = await this.clientRepo.findByClientId(command.clientId);
    // Missing client and wrong-secret both collapse to invalid-client to
    // prevent clientId enumeration (same approach as the former ApiKeyGuard).
    if (
      !client ||
      client.clientKind !== "confidential" ||
      !client.secretHash ||
      client.secretHash !== hashSecret(command.clientSecret)
    ) {
      throw new UnauthorizedException({
        code: "invalid-client",
        title: "Client authentication failed",
        status: 401,
      });
    }

    if (
      client.clientId === DEVICE_CLIENT_CONFIG.legacyClientId &&
      isLegacyClientCutover()
    ) {
      throw new UnauthorizedException({
        code: "client-migration-required",
        title: "This shared client has reached its migration cutoff",
        status: 401,
      });
    }

    // Distinct status errors so the TV client can show the right message.
    if (client.status === "disabled") {
      throw new UnauthorizedException({
        code: "client-disabled",
        title: "Client is disabled",
        status: 401,
      });
    }
    if (client.status === "revoked") {
      throw new UnauthorizedException({
        code: "client-revoked",
        title: "Client has been revoked",
        status: 401,
      });
    }

    const plaintext = generateAccessToken();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    await this.tokenRepo.create({
      clientId: client.id,
      tokenHash: hashSecret(plaintext),
      tokenPrefix: maskSecretPrefix(plaintext),
      expiresAt,
      grantType: "client_credentials",
      scope: "open:read",
    });

    // Best-effort lastUsedAt — never block on it.
    void this.clientRepo.touchLastUsed(client.id).catch(() => {});

    return {
      accessToken: plaintext,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      scope: "open:read",
    };
  }
}
