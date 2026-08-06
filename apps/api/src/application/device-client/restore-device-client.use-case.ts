import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";

/** Clears a terminal revoke after an explicit account-owner confirmation. */
@Injectable()
export class RestoreDeviceClientUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async execute(command: {
    id: string;
    ownerUserId: string;
    restoredBy: string;
    requestId?: string | null;
  }) {
    const existing = await this.repo.findOwned(command.id, command.ownerUserId);
    if (!existing)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    if (existing.status === "active") return existing;
    const restored = await this.repo.restoreOwned(
      command.id,
      command.ownerUserId,
      command.restoredBy,
      undefined,
      command.requestId,
    );
    if (!restored)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    return restored;
  }
}
