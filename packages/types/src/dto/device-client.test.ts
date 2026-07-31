import { describe, expect, it } from "vitest";
import {
  DeviceClientSchema,
  DeviceCodeGrantRequestSchema,
  DeviceAuthorizationRequestSchema,
  DisplayNameSchema,
  TokenGrantRequestSchema,
  UserCodeSchema,
} from "./device-client";

describe("device-client contract schemas", () => {
  it("trims printable display names and rejects invisible characters", () => {
    expect(DisplayNameSchema.parse("  客厅电视 ")).toBe("客厅电视");
    expect(DisplayNameSchema.safeParse("\u200b电视").success).toBe(false);
    expect(DisplayNameSchema.safeParse(" ").success).toBe(false);
  });

  it("rejects sensitive network and hardware identifiers in device summaries", () => {
    const request = {
      client_id: "magi_tv",
      device_type: "android_tv" as const,
      platform: "android" as const,
      platform_version: "Android 14",
      app_version: "1.0.0",
      identity_summary: "TV 192.168.1.20",
    };
    expect(
      DeviceAuthorizationRequestSchema.safeParse(request).success,
    ).toBe(false);
  });

  it("normalizes short codes without accepting ambiguous characters", () => {
    expect(UserCodeSchema.parse("abcd-efgh")).toBe("ABCDEFGH");
    expect(UserCodeSchema.safeParse("ABCD-0000").success).toBe(false);
  });

  it("dispatches device-code grants by grant_type", () => {
    const parsed = TokenGrantRequestSchema.parse({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "magi_tv",
      device_code: "x".repeat(32),
    });
    expect(parsed).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "magi_tv",
      device_code: "x".repeat(32),
    });
    expect(DeviceCodeGrantRequestSchema.safeParse(parsed).success).toBe(true);
  });

  it("keeps nullable timestamps explicit in the client projection", () => {
    const result = DeviceClientSchema.parse({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "客厅电视",
      deviceType: "android_tv",
      platform: "android",
      platformVersion: "14",
      appVersion: "1.0.0",
      identitySummary: "Example TV",
      status: "offline",
      registeredAt: "2026-01-01T00:00:00.000Z",
      lastActiveAt: null,
      revokedAt: null,
    });
    expect(result.lastActiveAt).toBeNull();
  });
});
