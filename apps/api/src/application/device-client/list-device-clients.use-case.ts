import { Inject, Injectable } from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  type DeviceClientRepository,
} from "@/domain/device-client";

@Injectable()
export class ListDeviceClientsUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  execute(args: { ownerUserId: string; page: number; pageSize: number }) {
    return this.repo.listOwned(args);
  }
}
