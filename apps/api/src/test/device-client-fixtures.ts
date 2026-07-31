/** Safe, non-secret values shared by device-client API tests. */
export const deviceClientFixture = {
  id: "00000000-0000-4000-8000-000000000007",
  ownerUserId: "user-device-owner",
  oauthClientId: "00000000-0000-4000-8000-000000000008",
  displayName: "客厅电视",
  deviceType: "android_tv" as const,
  platform: "android",
  platformVersion: "Android 14 (API 34)",
  appVersion: "1.0.0",
  identitySummary: "Magi TV emulator",
};
