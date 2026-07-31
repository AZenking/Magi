import { describe, expect, it, vi } from "vitest";
import { ListDeviceClientsUseCase } from "../list-device-clients.use-case";

describe("ListDeviceClientsUseCase", () => {
  it("passes only the authenticated owner and validated page to the repository", async () => {
    const listOwned = vi.fn(async () => ({
      items: [],
      total: 0,
      asOf: new Date("2026-07-31T00:00:00.000Z"),
    }));
    const useCase = new ListDeviceClientsUseCase({ listOwned } as never);

    await useCase.execute({ ownerUserId: "account-a", page: 2, pageSize: 50 });

    expect(listOwned).toHaveBeenCalledWith({
      ownerUserId: "account-a",
      page: 2,
      pageSize: 50,
    });
    expect(listOwned).not.toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "account-b" }),
    );
  });

  it("returns an empty page without inventing device records", async () => {
    const result = await new ListDeviceClientsUseCase({
      listOwned: async () => ({ items: [], total: 0, asOf: new Date() }),
    } as never).execute({ ownerUserId: "account-a", page: 1, pageSize: 20 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
