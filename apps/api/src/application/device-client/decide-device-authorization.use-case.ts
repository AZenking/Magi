import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";
import { digestUserCode } from "./device-client-crypto";

@Injectable()
export class DecideDeviceAuthorizationUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async approve(command: {
    userCode: string;
    ownerUserId: string;
    displayName: string;
  }) {
    const grant = await this.repo.findAuthorizationByUserCode(
      digestUserCode(command.userCode),
    );
    if (!grant || grant.status !== "pending" || grant.expiresAt <= new Date()) {
      throw new NotFoundException({
        code: "authorization-code-unavailable",
        status: 404,
      });
    }
    const updated = await this.repo.approveAuthorization(
      grant.id,
      command.ownerUserId,
      command.displayName,
    );
    if (!updated)
      throw new ConflictException({
        code: "authorization-already-decided",
        status: 409,
      });
    return {
      userCode: command.userCode,
      status: "approved" as const,
      expiresAt: updated.expiresAt,
    };
  }

  async deny(command: { userCode: string; ownerUserId: string }) {
    const grant = await this.repo.findAuthorizationByUserCode(
      digestUserCode(command.userCode),
    );
    if (!grant || grant.status !== "pending" || grant.expiresAt <= new Date()) {
      throw new NotFoundException({
        code: "authorization-code-unavailable",
        status: 404,
      });
    }
    const updated = await this.repo.denyAuthorization(
      grant.id,
      command.ownerUserId,
    );
    if (!updated)
      throw new ConflictException({
        code: "authorization-already-decided",
        status: 409,
      });
    return {
      userCode: command.userCode,
      status: "denied" as const,
      expiresAt: updated.expiresAt,
    };
  }
}
