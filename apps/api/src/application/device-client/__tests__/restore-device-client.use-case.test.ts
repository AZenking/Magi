import { describe, expect, it, vi } from "vitest";
import { RestoreDeviceClientUseCase } from "../restore-device-client.use-case";

const revoked = {
  id: "device-a",
  ownerUserId: "account-a",
  status: "revoked" as const,
  displayName: "客厅电视",
};

describe("RestoreDeviceClientUseCase", () => {
  it("restores an owned revoked client and keeps the operation owner-scoped", async () => {
    const restoreOwned = vi.fn(async () => ({ ...revoked, status: "active" as const }));
    const useCase = new RestoreDeviceClientUseCase({
      findOwned: vi.fn(async () => revoked),
      restoreOwned,
    } as never);

    const result = await useCase.execute({
      id: "device-a",
      ownerUserId: "account-a",
      restoredBy: "account-a",
      requestId: "request-1",
    });

    expect(result.status).toBe("active");
    expect(restoreOwned).toHaveBeenCalledWith(
      "device-a",
      "account-a",
      "account-a",
      undefined,
      "request-1",
    );
  });

  it("is idempotent when a concurrent request already restored the client", async () => {
    const active = { ...revoked, status: "active" as const };
    const restoreOwned = vi.fn();
    const result = await new RestoreDeviceClientUseCase({
      findOwned: vi.fn(async () => active),
      restoreOwned,
    } as never).execute({
      id: "device-a",
      ownerUserId: "account-a",
      restoredBy: "account-a",
    });

    expect(result).toEqual(active);
    expect(restoreOwned).not.toHaveBeenCalled();
  });
});
