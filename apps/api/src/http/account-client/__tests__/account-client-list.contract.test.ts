import { describe, expect, it } from "vitest";
import {
  AccountClientListQuerySchema,
  DeviceClientPageSchema,
} from "@magi/types";

describe("account client list contract", () => {
  it("accepts stable server pagination and rejects account ownership input", () => {
    expect(AccountClientListQuerySchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(AccountClientListQuerySchema.safeParse({ accountId: "other" }).success).toBe(false);
  });

  it("exposes only privacy-safe device fields", () => {
    const page = DeviceClientPageSchema.parse({
      items: [{
        id: "00000000-0000-4000-8000-000000000007",
        displayName: "客厅电视",
        deviceType: "android_tv",
        platform: "android",
        platformVersion: "Android 14",
        appVersion: "1.0.0",
        identitySummary: "Magi TV",
        status: "online",
        registeredAt: "2026-07-31T00:00:00.000Z",
        lastActiveAt: "2026-07-31T00:01:00.000Z",
        revokedAt: null,
      }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      asOf: "2026-07-31T00:01:00.000Z",
    });
    expect(JSON.stringify(page)).not.toContain("token");
    expect(JSON.stringify(page)).not.toContain("secret");
  });
});
