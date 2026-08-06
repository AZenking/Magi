export type DeviceClientLifecycleStatus = "active" | "revoked";
export type DevicePresenceStatus = "online" | "offline" | "revoked";
export type DeviceType = "android_tv";

export interface DeviceClient {
  id: string;
  ownerUserId: string;
  oauthClientId: string;
  installationId: string | null;
  displayName: string;
  deviceType: DeviceType;
  platform: string;
  platformVersion: string;
  appVersion: string;
  identitySummary: string;
  status: DeviceClientLifecycleStatus;
  registeredAt: Date;
  lastHeartbeatAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceClientProjection extends DeviceClient {
  presenceStatus: DevicePresenceStatus;
  asOf: Date;
}

export interface DeviceAuthorizationGrant {
  id: string;
  oauthClientId: string;
  deviceCodeHash: string;
  userCodeDigest: string;
  deviceType: DeviceType;
  platform: string;
  platformVersion: string;
  appVersion: string;
  identitySummary: string;
  requestedDisplayName: string | null;
  status: "pending" | "approved" | "denied" | "consumed" | "expired";
  ownerUserId: string | null;
  approvedDisplayName: string | null;
  expiresAt: Date;
  pollIntervalSeconds: number;
  lastPolledAt: Date | null;
  approvedAt: Date | null;
  consumedAt: Date | null;
  deviceClientId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceRefreshToken {
  id: string;
  deviceClientId: string;
  oauthClientId: string;
  familyId: string;
  generation: number;
  tokenHash: string;
  tokenPrefix: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeDisplayName(value: string): string {
  return value.trim();
}

export function isDisplayNameValid(value: string): boolean {
  const normalized = normalizeDisplayName(value);
  return (
    normalized.length >= 1 &&
    normalized.length <= 64 &&
    !/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/u.test(normalized)
  );
}

export function derivePresenceStatus(
  client: Pick<DeviceClient, "status" | "lastHeartbeatAt">,
  asOf: Date,
  onlineWindowSeconds = 150,
): DevicePresenceStatus {
  if (client.status === "revoked") return "revoked";
  if (
    client.lastHeartbeatAt &&
    client.lastHeartbeatAt.getTime() >=
      asOf.getTime() - onlineWindowSeconds * 1000
  ) {
    return "online";
  }
  return "offline";
}

export function canRename(client: Pick<DeviceClient, "status">): boolean {
  return client.status === "active";
}

export function canRevoke(client: Pick<DeviceClient, "status">): boolean {
  return client.status === "active";
}
