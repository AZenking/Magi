import { describe, expect, it } from "vitest";
import {
  DeviceAuthorizationRequestSchema,
  DeviceAuthorizationResponseSchema,
  DeviceRegistrationRequestSchema,
  TokenGrantRequestSchema,
} from "@magi/types";

describe("device authorization open contract", () => {
  it("accepts the TV request and fixed RFC 8628 response shape", () => {
    expect(DeviceAuthorizationRequestSchema.safeParse({
      client_id: "magi_tv",
      device_type: "android_tv",
      platform: "android",
      platform_version: "Android 14",
      app_version: "1.0.0",
      identity_summary: "Magi TV",
    }).success).toBe(true);
    expect(DeviceAuthorizationResponseSchema.safeParse({
      device_code: "a".repeat(32),
      user_code: "ABCD-2345",
      verification_uri: "https://magi.example/authorize",
      expires_in: 600,
      interval: 5,
    }).success).toBe(true);
  });

  it("dispatches device and refresh grants without accepting extra secrets", () => {
    expect(TokenGrantRequestSchema.safeParse({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "magi_tv",
      device_code: "a".repeat(32),
    }).success).toBe(true);
    expect(TokenGrantRequestSchema.safeParse({
      grant_type: "refresh_token",
      client_id: "magi_tv",
      refresh_token: "rft_" + "a".repeat(32),
      client_secret: "must-not-be-accepted",
    }).success).toBe(false);
  });

  it("accepts automatic registration with a stable installation id", () => {
    expect(DeviceRegistrationRequestSchema.safeParse({
      client_id: "magi_tv",
      installation_id: "00000000-0000-4000-8000-000000000009",
      device_type: "android_tv",
      platform: "android",
      platform_version: "Android 14",
      app_version: "1.0.0",
      identity_summary: "Magi TV",
    }).success).toBe(true);
    expect(DeviceRegistrationRequestSchema.safeParse({
      client_id: "magi_tv",
      installation_id: "not-a-uuid",
      device_type: "android_tv",
      platform: "android",
      platform_version: "Android 14",
      app_version: "1.0.0",
      identity_summary: "Magi TV",
    }).success).toBe(false);
  });
});
