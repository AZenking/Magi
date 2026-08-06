import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";

@Injectable()
export class RevokeDeviceClientUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async execute(command: {
    id: string;
    ownerUserId: string;
    revokedBy: string;
    requestId?: string | null;
  }) {
    const result = await this.repo.revokeOwned(
      command.id,
      command.ownerUserId,
      command.revokedBy,
      undefined,
      command.requestId,
    );
    if (!result)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    return result;
  }
}
