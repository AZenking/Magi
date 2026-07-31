import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";
import {
  OAUTH_CLIENT_REPOSITORY,
  type IOauthClientRepository,
} from "@/domain/oauth";
import { DEVICE_CLIENT_CONFIG } from "../../infrastructure/config/device-client.config";
import { hashSecret } from "../../shared/crypto/secret-utils";
import {
  makeAccessTokenMaterial,
  makeRefreshTokenMaterial,
} from "./device-client-crypto";

@Injectable()
export class RefreshDeviceTokenUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClients: IOauthClientRepository,
  ) {}

  async execute(command: { clientId: string; refreshToken: string }) {
    const old = await this.repo.findRefreshTokenByHash(
      hashSecret(command.refreshToken),
    );
    if (!old)
      throw new UnauthorizedException({ code: "invalid_grant", status: 401 });
    const client = await this.oauthClients.findByClientId(command.clientId);
    if (
      !client ||
      client.id !== old.oauthClientId ||
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
    const result = await this.repo.rotateRefreshToken({
      tokenId: old.id,
      now,
      nextAccessToken: access,
      nextRefreshToken: refresh,
    });
    if (result.kind === "replay")
      throw new UnauthorizedException({ code: "invalid_grant", status: 401 });
    if (result.kind === "invalid")
      throw new BadRequestException({ code: "invalid_grant", status: 400 });
    return {
      accessToken: result.accessToken.plaintext,
      refreshToken: result.refreshToken.plaintext,
      expiresIn: DEVICE_CLIENT_CONFIG.accessTokenTtlSeconds,
      refreshExpiresIn: DEVICE_CLIENT_CONFIG.refreshTokenTtlSeconds,
      deviceClientId: result.deviceClient.id,
      scope: result.accessToken.scope,
    };
  }
}
