export const DEVICE_CLIENT_CONFIG = {
  publicClientId: process.env.MAGI_DEVICE_CLIENT_ID ?? "magi_tv",
  defaultOwnerUsername:
    process.env.MAGI_DEFAULT_DEVICE_OWNER_USERNAME ??
    process.env.MAGI_ADMIN_USERNAME ??
    "admin",
  legacyClientId: process.env.MAGI_LEGACY_DEVICE_CLIENT_ID ?? "magi_tv_android",
  legacyCutoverAt: process.env.MAGI_LEGACY_DEVICE_CLIENT_CUTOFF_AT
    ? new Date(process.env.MAGI_LEGACY_DEVICE_CLIENT_CUTOFF_AT)
    : null,
  userCodePepper:
    process.env.MAGI_DEVICE_USER_CODE_PEPPER ?? "magi-device-code-dev-pepper",
  verificationUri:
    process.env.MAGI_DEVICE_VERIFICATION_URI ??
    "http://localhost:3000/dashboard/account/clients/authorize",
  grantExpiresSeconds: 600,
  initialPollIntervalSeconds: 5,
  heartbeatIntervalSeconds: 60,
  onlineWindowSeconds: 150,
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
} as const;

export function isLegacyClientCutover(): boolean {
  const cutoff = DEVICE_CLIENT_CONFIG.legacyCutoverAt;
  return (
    cutoff instanceof Date &&
    !Number.isNaN(cutoff.getTime()) &&
    Date.now() >= cutoff.getTime()
  );
}
