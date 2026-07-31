import { describe, expect, it } from "vitest";
import {
  DeviceClientSchema,
  RenameDeviceClientRequestSchema,
  RevokeDeviceClientResultSchema,
} from "@magi/types";

describe("account client lifecycle contract", () => {
  it("trims and validates rename payloads without accepting ownership fields", () => {
    expect(RenameDeviceClientRequestSchema.parse({ displayName: "  TV  " })).toEqual({
      displayName: "TV",
    });
    expect(RenameDeviceClientRequestSchema.safeParse({ displayName: "TV", accountId: "other" }).success).toBe(false);
  });

  it("keeps revoke responses redacted and terminal", () => {
    const client = {
      id: "00000000-0000-4000-8000-000000000007",
      displayName: "TV",
      deviceType: "android_tv",
      platform: "android",
      platformVersion: "Android 14",
      appVersion: "1.0.0",
      identitySummary: "Magi TV",
      status: "revoked",
      registeredAt: "2026-07-31T00:00:00.000Z",
      lastActiveAt: null,
      revokedAt: "2026-07-31T00:01:00.000Z",
    } as const;
    const result = RevokeDeviceClientResultSchema.parse({
      client,
      accessTokensRevoked: 1,
      refreshTokensRevoked: 1,
    });
    expect(DeviceClientSchema.parse(result.client).status).toBe("revoked");
    expect(JSON.stringify(result)).not.toContain("refresh_token");
  });
});
