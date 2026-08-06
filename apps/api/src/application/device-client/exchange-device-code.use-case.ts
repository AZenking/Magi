import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";
import {
  OAUTH_CLIENT_REPOSITORY,
  type IOauthClientRepository,
} from "@/domain/oauth";
import { DEVICE_CLIENT_CONFIG } from "../../infrastructure/config/device-client.config";
import {
  makeAccessTokenMaterial,
  makeRefreshTokenMaterial,
  hashDeviceCode,
} from "./device-client-crypto";

@Injectable()
export class ExchangeDeviceCodeUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClients: IOauthClientRepository,
  ) {}

  async execute(command: {
    clientId: string;
    deviceCode: string;
    requestId?: string | null;
  }) {
    const grant = await this.repo.findAuthorizationByDeviceCode(
      hashDeviceCode(command.deviceCode),
    );
    if (!grant)
      throw new UnauthorizedException({ code: "invalid_grant", status: 401 });
    const client = await this.oauthClients.findByClientId(command.clientId);
    if (
      !client ||
      client.id !== grant.oauthClientId ||
      client.clientKind !== "public_device" ||
      client.status !== "active"
    ) {
      throw new UnauthorizedException({ code: "invalid-client", status: 401 });
    }
    const now = new Date();
    const access = makeAccessTokenMaterial(
      new Date(
        now.getTime() + DEVICE_CLIENT_CONFIG.accessTokenTtlSeconds * 1000,
      ),
    );
    const refresh = makeRefreshTokenMaterial(
      new Date(
        now.getTime() + DEVICE_CLIENT_CONFIG.refreshTokenTtlSeconds * 1000,
      ),
    );
    const result = await this.repo.consumeAuthorization({
      id: grant.id,
      now,
      requestId: command.requestId,
      displayName:
        grant.approvedDisplayName ?? grant.requestedDisplayName ?? "Android TV",
      accessToken: access,
      refreshToken: { ...refresh, familyId: randomUUID() },
    });
    if ("kind" in result) {
      if (result.kind === "pending" || result.kind === "slow_down") {
        throw new BadRequestException({
          code: result.kind === "pending" ? "authorization_pending" : "slow_down",
          status: 400,
        });
      }
      if (result.kind === "denied")
        throw new BadRequestException({ code: "access_denied", status: 400 });
      if (result.kind === "expired")
        throw new BadRequestException({ code: "expired_token", status: 400 });
      throw new UnauthorizedException({ code: "invalid_grant", status: 401 });
    }
    return {
      accessToken: result.accessToken.plaintext,
      refreshToken: result.refreshToken.plaintext,
      expiresIn: DEVICE_CLIENT_CONFIG.accessTokenTtlSeconds,
      refreshExpiresIn: DEVICE_CLIENT_CONFIG.refreshTokenTtlSeconds,
      deviceClientId: result.client.id,
      scope: result.accessToken.scope,
    };
  }
}
