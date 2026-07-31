import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  DEFAULT_DEVICE_OWNER_REPOSITORY,
  DEVICE_CLIENT_REPOSITORY,
  isDisplayNameValid,
  normalizeDisplayName,
  type DefaultDeviceOwnerRepository,
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
} from "./device-client-crypto";
import { randomUUID } from "node:crypto";

/** Registers a TV directly to the configured default account. */
@Injectable()
export class RegisterDefaultDeviceUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClients: IOauthClientRepository,
    @Inject(DEFAULT_DEVICE_OWNER_REPOSITORY)
    private readonly ownerRepo: DefaultDeviceOwnerRepository,
  ) {}

  async execute(command: {
    clientId: string;
    installationId: string;
    deviceType: "android_tv";
    platform: string;
    platformVersion: string;
    appVersion: string;
    identitySummary: string;
    suggestedName?: string | null;
    requestId?: string | null;
  }) {
    const oauthClient = await this.oauthClients.findByClientId(command.clientId);
    if (
      !oauthClient ||
      oauthClient.clientKind !== "public_device" ||
      oauthClient.status !== "active"
    ) {
      throw new UnauthorizedException({ code: "invalid-client", status: 401 });
    }

    const owner = await this.ownerRepo.findByUsername(
      DEVICE_CLIENT_CONFIG.defaultOwnerUsername,
    );
    if (!owner) {
      throw new ServiceUnavailableException({
        code: "default-device-owner-unavailable",
        status: 503,
      });
    }

    const suggested = normalizeDisplayName(
      command.suggestedName?.trim() || command.identitySummary.trim(),
    );
    const displayName = isDisplayNameValid(suggested)
      ? suggested
      : "Android TV";
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

    const result = await this.repo.registerDefaultDevice({
      ownerUserId: owner.id,
      oauthClientId: oauthClient.id,
      installationId: command.installationId,
      displayName,
      deviceType: command.deviceType,
      platform: command.platform,
      platformVersion: command.platformVersion,
      appVersion: command.appVersion,
      identitySummary: command.identitySummary,
      now,
      requestId: command.requestId,
      accessToken: access,
      refreshToken: { ...refresh, familyId: randomUUID() },
    });
    if (!("client" in result)) {
      throw new UnauthorizedException({
        code: "device-client-revoked",
        status: 401,
      });
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
