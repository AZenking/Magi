import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
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
  digestUserCode,
  generateDeviceCode,
  generateUserCode,
  hashDeviceCode,
} from "./device-client-crypto";

@Injectable()
export class BeginDeviceAuthorizationUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
    @Inject(OAUTH_CLIENT_REPOSITORY)
    private readonly oauthClients: IOauthClientRepository,
  ) {}

  async execute(command: {
    clientId: string;
    deviceType: "android_tv";
    platform: string;
    platformVersion: string;
    appVersion: string;
    identitySummary: string;
    suggestedName?: string | null;
  }) {
    const client = await this.oauthClients.findByClientId(command.clientId);
    if (
      !client ||
      client.clientKind !== "public_device" ||
      client.status !== "active"
    ) {
      throw new UnauthorizedException({ code: "invalid-client", status: 401 });
    }
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = new Date(
      Date.now() + DEVICE_CLIENT_CONFIG.grantExpiresSeconds * 1000,
    );
    await this.repo.createAuthorizationGrant({
      oauthClientId: client.id,
      deviceCodeHash: hashDeviceCode(deviceCode),
      userCodeDigest: digestUserCode(userCode),
      deviceType: command.deviceType,
      platform: command.platform,
      platformVersion: command.platformVersion,
      appVersion: command.appVersion,
      identitySummary: command.identitySummary,
      requestedDisplayName: command.suggestedName ?? null,
      expiresAt,
      pollIntervalSeconds: DEVICE_CLIENT_CONFIG.initialPollIntervalSeconds,
    });
    return {
      deviceCode,
      userCode,
      verificationUri: DEVICE_CLIENT_CONFIG.verificationUri,
      verificationUriComplete: `${DEVICE_CLIENT_CONFIG.verificationUri}?code=${encodeURIComponent(userCode)}`,
      expiresIn: DEVICE_CLIENT_CONFIG.grantExpiresSeconds as 600,
      interval: DEVICE_CLIENT_CONFIG.initialPollIntervalSeconds,
    };
  }
}
