import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DEVICE_CLIENT_REPOSITORY,
  isDisplayNameValid,
  normalizeDisplayName,
  type DeviceClientRepository,
} from "@/domain/device-client";

@Injectable()
export class RenameDeviceClientUseCase {
  constructor(
    @Inject(DEVICE_CLIENT_REPOSITORY)
    private readonly repo: DeviceClientRepository,
  ) {}

  async execute(command: {
    id: string;
    ownerUserId: string;
    displayName: string;
  }) {
    const displayName = normalizeDisplayName(command.displayName);
    if (!isDisplayNameValid(displayName)) {
      throw new ConflictException({
        code: "invalid-display-name",
        status: 409,
      });
    }
    const existing = await this.repo.findOwned(command.id, command.ownerUserId);
    if (!existing)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    if (existing.status === "revoked") {
      throw new ConflictException({ code: "client-revoked", status: 409 });
    }
    const updated = await this.repo.renameOwned(
      command.id,
      command.ownerUserId,
      displayName,
    );
    if (!updated)
      throw new NotFoundException({ code: "resource-not-found", status: 404 });
    return updated;
  }
}
