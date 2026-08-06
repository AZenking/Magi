import { z } from "zod";

/** Shared device-client contract used by API and Web. */
export const DeviceTypeSchema = z.literal("android_tv");
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const DeviceClientStatusSchema = z.enum([
  "online",
  "offline",
  "revoked",
]);
export type DeviceClientStatus = z.infer<typeof DeviceClientStatusSchema>;

const printableText = /^[^\p{Cc}\p{Cf}]*$/u;

/** A display name is trimmed before all domain operations. */
export const DisplayNameSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 1 && value.length <= 64, {
    message: "displayName must contain 1–64 characters after trimming",
  })
  .refine((value) => printableText.test(value), {
    message: "displayName must contain printable characters",
  });
export type DisplayName = z.infer<typeof DisplayNameSchema>;

const metadataText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => printableText.test(value), "metadata must be printable");

const sensitiveIdentityPattern =
  /(?:\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b|\b(?:advertising|ad[_ -]?id|idfa|aaid)\b)/iu;

const identitySummaryText = metadataText(120).refine(
  (value) => !sensitiveIdentityPattern.test(value),
  "identity summary must not contain an IP, hardware address, or advertising identifier",
);

export const DeviceAuthorizationRequestSchema = z
  .object({
    client_id: z.string().min(1).max(64),
    device_type: DeviceTypeSchema,
    platform: z.literal("android"),
    platform_version: metadataText(64),
    app_version: metadataText(64),
    identity_summary: identitySummaryText,
    suggested_name: DisplayNameSchema.nullable().optional(),
  })
  .strict();
export type DeviceAuthorizationRequest = z.infer<
  typeof DeviceAuthorizationRequestSchema
>;

/** First-run registration payload for the configured default account. */
export const DeviceRegistrationRequestSchema = DeviceAuthorizationRequestSchema.extend({
  installation_id: z.string().uuid(),
}).strict();
export type DeviceRegistrationRequest = z.infer<
  typeof DeviceRegistrationRequestSchema
>;

export const DeviceAuthorizationResponseSchema = z
  .object({
    device_code: z.string().min(32),
    user_code: z.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/),
    verification_uri: z.string().url(),
    verification_uri_complete: z.string().url().nullable().optional(),
    expires_in: z.literal(600),
    interval: z.number().int().min(5),
  })
  .strict();
export type DeviceAuthorizationResponse = z.infer<
  typeof DeviceAuthorizationResponseSchema
>;

export const ClientCredentialsGrantRequestSchema = z
  .object({
    grant_type: z.literal("client_credentials"),
    client_id: z.string().min(1).max(64),
    client_secret: z.string().min(1).max(128),
  })
  .strict();

export const DeviceCodeGrantRequestSchema = z
  .object({
    grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code"),
    client_id: z.string().min(1).max(64),
    device_code: z.string().min(32),
  })
  .strict();

export const RefreshTokenGrantRequestSchema = z
  .object({
    grant_type: z.literal("refresh_token"),
    client_id: z.string().min(1).max(64),
    refresh_token: z.string().min(32),
  })
  .strict();

export const TokenGrantRequestSchema = z.discriminatedUnion("grant_type", [
  ClientCredentialsGrantRequestSchema,
  DeviceCodeGrantRequestSchema,
  RefreshTokenGrantRequestSchema,
]);
export type TokenGrantRequest = z.infer<typeof TokenGrantRequestSchema>;

export const TokenResponseSchema = z
  .object({
    access_token: z.string().min(32),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
    scope: z.string(),
    refresh_token: z.string().min(32).optional(),
    refresh_expires_in: z.number().int().positive().optional(),
    device_client_id: z.string().uuid().optional(),
  })
  .strict();
export type DeviceTokenResponse = z.infer<typeof TokenResponseSchema>;

export const HeartbeatRequestSchema = z
  .object({
    app_version: metadataText(64),
    platform_version: metadataText(64),
  })
  .strict();
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

export const HeartbeatResponseSchema = z
  .object({
    server_time: z.string().datetime(),
    last_active_at: z.string().datetime(),
    next_heartbeat_in_seconds: z.literal(60),
    online_window_seconds: z.literal(150),
    content_revision: z
      .object({
        catalog: z.string().min(1),
        epg: z.string().min(1),
      })
      .optional(),
  })
  .strict();
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;

export const AccountClientListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((value) => [20, 50, 100].includes(value), {
        message: "pageSize must be 20, 50, or 100",
      })
      .default(20),
    search: z.string().trim().max(120).optional(),
    status: DeviceClientStatusSchema.optional(),
  })
  .strict();
export type AccountClientListQuery = z.infer<
  typeof AccountClientListQuerySchema
>;

export const RenameDeviceClientRequestSchema = z
  .object({ displayName: DisplayNameSchema })
  .strict();
export type RenameDeviceClientRequest = z.infer<
  typeof RenameDeviceClientRequestSchema
>;

export const UserCodeSchema = z
  .string()
  .transform((value) => value.replace(/-/g, "").toUpperCase())
  .refine((value) => /^[A-HJ-NP-Z2-9]{8}$/.test(value), "invalid user code");
export type UserCode = z.infer<typeof UserCodeSchema>;

export const ApproveDeviceAuthorizationRequestSchema = z
  .object({ displayName: DisplayNameSchema })
  .strict();
export type ApproveDeviceAuthorizationRequest = z.infer<
  typeof ApproveDeviceAuthorizationRequestSchema
>;

export const DeviceAuthorizationPreviewSchema = z
  .object({
    userCode: z.string(),
    deviceType: DeviceTypeSchema,
    platform: z.string(),
    platformVersion: z.string(),
    appVersion: z.string(),
    identitySummary: z.string(),
    suggestedName: z.string().nullable(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type DeviceAuthorizationPreview = z.infer<
  typeof DeviceAuthorizationPreviewSchema
>;

export const DeviceAuthorizationDecisionSchema = z
  .object({
    userCode: z.string(),
    status: z.enum(["approved", "denied"]),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type DeviceAuthorizationDecision = z.infer<
  typeof DeviceAuthorizationDecisionSchema
>;

export const DeviceClientSchema = z
  .object({
    id: z.string().uuid(),
    displayName: DisplayNameSchema,
    deviceType: DeviceTypeSchema,
    platform: z.string(),
    platformVersion: z.string(),
    appVersion: z.string(),
    identitySummary: z.string(),
    status: DeviceClientStatusSchema,
    registeredAt: z.string().datetime(),
    lastActiveAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
  })
  .strict();
export type DeviceClient = z.infer<typeof DeviceClientSchema>;

export const DeviceClientPageSchema = z
  .object({
    items: z.array(DeviceClientSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().positive(),
    asOf: z.string().datetime(),
  })
  .strict();
export type DeviceClientPage = z.infer<typeof DeviceClientPageSchema>;

export const RevokeDeviceClientResultSchema = z
  .object({
    client: DeviceClientSchema,
    accessTokensRevoked: z.number().int().nonnegative(),
    refreshTokensRevoked: z.number().int().nonnegative(),
  })
  .strict();
export type RevokeDeviceClientResult = z.infer<
  typeof RevokeDeviceClientResultSchema
>;

export const RestoreDeviceClientResultSchema = z
  .object({ client: DeviceClientSchema })
  .strict();
export type RestoreDeviceClientResult = z.infer<
  typeof RestoreDeviceClientResultSchema
>;

export const DeviceClientProblemCodeSchema = z.enum([
  "authorization_pending",
  "slow_down",
  "access_denied",
  "expired_token",
  "invalid_grant",
  "device-client-revoked",
  "invalid-client",
  "client-disabled",
  "client-revoked",
  "client-migration-required",
]);
export type DeviceClientProblemCode = z.infer<
  typeof DeviceClientProblemCodeSchema
>;

export const DeviceClientEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data });
