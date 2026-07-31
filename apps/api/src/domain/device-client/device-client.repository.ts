import type {
  DeviceAuthorizationGrant,
  DeviceClient,
  DeviceClientProjection,
  DeviceRefreshToken,
} from "./device-client.model";

export const DEVICE_CLIENT_REPOSITORY = "DEVICE_CLIENT_REPOSITORY";

export const DEFAULT_DEVICE_OWNER_REPOSITORY =
  "DEFAULT_DEVICE_OWNER_REPOSITORY";

export interface DefaultDeviceOwnerRepository {
  findByUsername(username: string): Promise<{ id: string } | null>;
}

export interface ListDeviceClientsQuery {
  ownerUserId: string;
  page: number;
  pageSize: number;
  asOf?: Date;
}

export interface ListDeviceClientsResult {
  items: DeviceClientProjection[];
  total: number;
  asOf: Date;
}

export interface CreateDeviceClientInput {
  ownerUserId: string;
  oauthClientId: string;
  installationId?: string | null;
  displayName: string;
  deviceType: "android_tv";
  platform: string;
  platformVersion: string;
  appVersion: string;
  identitySummary: string;
}

export interface RegisterDefaultDeviceInput {
  ownerUserId: string;
  oauthClientId: string;
  installationId: string;
  displayName: string;
  deviceType: "android_tv";
  platform: string;
  platformVersion: string;
  appVersion: string;
  identitySummary: string;
  now: Date;
  requestId?: string | null;
  accessToken: {
    hash: string;
    prefix: string;
    expiresAt: Date;
    plaintext: string;
  };
  refreshToken: {
    hash: string;
    prefix: string;
    expiresAt: Date;
    plaintext: string;
    familyId: string;
  };
}

export interface CreateDeviceAuthorizationGrantInput {
  oauthClientId: string;
  deviceCodeHash: string;
  userCodeDigest: string;
  deviceType: "android_tv";
  platform: string;
  platformVersion: string;
  appVersion: string;
  identitySummary: string;
  requestedDisplayName: string | null;
  expiresAt: Date;
  pollIntervalSeconds: number;
}

export interface ConsumeDeviceAuthorizationResult {
  grant: DeviceAuthorizationGrant;
  client: DeviceClient;
  accessToken: {
    plaintext: string;
    expiresAt: Date;
    scope: string;
  };
  refreshToken: {
    plaintext: string;
    familyId: string;
    generation: number;
    expiresAt: Date;
  };
}

export interface RegisterDefaultDeviceResult {
  client: DeviceClient;
  accessToken: {
    plaintext: string;
    expiresAt: Date;
    scope: string;
  };
  refreshToken: {
    plaintext: string;
    familyId: string;
    generation: number;
    expiresAt: Date;
  };
}

export interface DeviceClientRepository {
  listOwned(query: ListDeviceClientsQuery): Promise<ListDeviceClientsResult>;
  findOwned(id: string, ownerUserId: string): Promise<DeviceClient | null>;
  renameOwned(
    id: string,
    ownerUserId: string,
    displayName: string,
  ): Promise<DeviceClient | null>;
  revokeOwned(
    id: string,
    ownerUserId: string,
    revokedBy: string,
    at?: Date,
    requestId?: string | null,
  ): Promise<{
    client: DeviceClient;
    accessTokensRevoked: number;
    refreshTokensRevoked: number;
    alreadyRevoked: boolean;
  } | null>;
  recordHeartbeat(input: {
    deviceClientId: string;
    appVersion: string;
    platformVersion: string;
    receivedAt?: Date;
  }): Promise<
    | { kind: "updated"; lastHeartbeatAt: Date }
    | { kind: "revoked" | "not_found" }
  >;

  registerDefaultDevice(
    input: RegisterDefaultDeviceInput,
  ): Promise<
    | RegisterDefaultDeviceResult
    | { kind: "revoked" }
  >;

  createAuthorizationGrant(
    input: CreateDeviceAuthorizationGrantInput,
  ): Promise<DeviceAuthorizationGrant>;
  findAuthorizationByUserCode(
    userCodeDigest: string,
  ): Promise<DeviceAuthorizationGrant | null>;
  findAuthorizationByDeviceCode(
    deviceCodeHash: string,
  ): Promise<DeviceAuthorizationGrant | null>;
  approveAuthorization(
    id: string,
    ownerUserId: string,
    displayName: string,
    at?: Date,
  ): Promise<DeviceAuthorizationGrant | null>;
  denyAuthorization(
    id: string,
    ownerUserId: string,
    at?: Date,
  ): Promise<DeviceAuthorizationGrant | null>;
  consumeAuthorization(input: {
    id: string;
    now: Date;
    requestId?: string | null;
    displayName: string;
    accessToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
    refreshToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
      familyId: string;
    };
  }): Promise<
    | ConsumeDeviceAuthorizationResult
    | { kind: "pending" | "slow_down" | "denied" | "expired" | "invalid" }
  >;

  findRefreshTokenByHash(hash: string): Promise<DeviceRefreshToken | null>;
  rotateRefreshToken(input: {
    tokenId: string;
    now: Date;
    nextAccessToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
    nextRefreshToken: {
      hash: string;
      prefix: string;
      expiresAt: Date;
      plaintext: string;
    };
  }): Promise<
    | {
        kind: "rotated";
        deviceClient: DeviceClient;
        accessToken: { plaintext: string; expiresAt: Date; scope: string };
        refreshToken: {
          plaintext: string;
          expiresAt: Date;
          familyId: string;
          generation: number;
        };
      }
    | { kind: "replay" }
    | { kind: "invalid" }
  >;
}
