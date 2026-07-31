import type { DeviceClient } from "@magi/types";

/** Privacy-safe fixture; deliberately contains no token, IP, or playback URL. */
export const deviceClientFixture: DeviceClient = {
  id: "00000000-0000-4000-8000-000000000007",
  displayName: "客厅电视",
  deviceType: "android_tv",
  platform: "android",
  platformVersion: "Android 14 (API 34)",
  appVersion: "1.0.0",
  identitySummary: "Magi TV emulator",
  status: "online",
  registeredAt: "2026-07-31T00:00:00.000Z",
  lastActiveAt: "2026-07-31T00:01:00.000Z",
  revokedAt: null,
};
