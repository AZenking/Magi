import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";
import { digestUserCode } from "./device-client-crypto";

@Injectable()
export class InspectDeviceAuthorizationUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async execute(userCode: string) {
    const grant = await this.repo.findAuthorizationByUserCode(
      digestUserCode(userCode),
    );
    if (!grant || grant.status !== "pending" || grant.expiresAt <= new Date()) {
      throw new NotFoundException({
        code: "authorization-code-unavailable",
        status: 404,
      });
    }
    return {
      userCode,
      deviceType: grant.deviceType,
      platform: grant.platform,
      platformVersion: grant.platformVersion,
      appVersion: grant.appVersion,
      identitySummary: grant.identitySummary,
      suggestedName: grant.requestedDisplayName,
      expiresAt: grant.expiresAt,
    };
  }
}
