import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";

@Injectable()
export class GetDeviceClientUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async execute(id: string, ownerUserId: string) {
    const client = await this.repo.findOwned(id, ownerUserId);
    if (!client)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    return client;
  }
}
