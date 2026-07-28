/**
 * Channel operations wire DTOs (T007).
 *
 * Schemas for channel lifecycle, manual EPG binding, stream ordering and
 * failover policy. Mirror contracts/channels.md.
 */
import { z } from "zod";
import {
  CHANNEL_LIFECYCLE,
  SOURCE_PRESENCE,
  STREAM_ORIGIN,
} from "../enum/channel-lifecycle";
import { FAILOVER_MODE } from "../enum/failover";

// ---------------------------------------------------------------------------
// Channel read model (GET /output/channels item).
//
// Named `OperationChannelVo` to avoid colliding with the legacy handwritten
// `ChannelVo` in `vo/index.ts` during the expand phase. When US2 (T059) migrates
// the channel list to the lifecycle read model, the legacy VO is retired and
// this type is aliased back to `ChannelVo`.
// ---------------------------------------------------------------------------
export const OperationChannelVoSchema = z.object({
  id: z.string().uuid(),
  standardName: z.string().min(1),
  lifecycle: z.enum(CHANNEL_LIFECYCLE),
  lifecycleReason: z.string().nullable(),
  trashedAt: z.string().datetime().nullable(),
  purgeAfter: z.string().datetime().nullable(),
  sourcePresence: z.enum(SOURCE_PRESENCE),
  manualEpgLocked: z.boolean(),
  primaryStreamId: z.string().uuid().nullable(),
  streamCount: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
export type OperationChannelVo = z.infer<typeof OperationChannelVoSchema>;

export const ChannelListQuerySchema = z.object({
  lifecycle: z.enum(CHANNEL_LIFECYCLE).optional(),
  sourcePresence: z.enum(SOURCE_PRESENCE).optional(),
  epgStatus: z.string().optional(),
  group: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ChannelListQuery = z.infer<typeof ChannelListQuerySchema>;

// ---------------------------------------------------------------------------
// Reversible lifecycle transition (POST /output/channels/{id}/lifecycle)
// ---------------------------------------------------------------------------
export const ChangeLifecycleRequestSchema = z.object({
  target: z.enum(CHANNEL_LIFECYCLE),
  reason: z.string().max(500).optional(),
});
export type ChangeLifecycleRequest = z.infer<typeof ChangeLifecycleRequestSchema>;

export const LifecycleTransitionResultSchema = z.object({
  previous: z.enum(CHANNEL_LIFECYCLE),
  current: z.enum(CHANNEL_LIFECYCLE),
  changedAt: z.string().datetime(),
  purgeAfter: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
});
export type LifecycleTransitionResult = z.infer<typeof LifecycleTransitionResultSchema>;

// ---------------------------------------------------------------------------
// Manual EPG binding (PATCH /output/channels/{id}/epg-binding)
// ---------------------------------------------------------------------------
export const UpdateEpgBindingRequestSchema = z.object({
  xmltvSourceId: z.string().uuid().nullable(),
  epgChannelId: z.string().nullable(),
  locked: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type UpdateEpgBindingRequest = z.infer<typeof UpdateEpgBindingRequestSchema>;

// ---------------------------------------------------------------------------
// Stream ordering (PUT /output/channels/{id}/streams/order)
// ---------------------------------------------------------------------------
export const StreamOrderItemSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
  eligibleForFailover: z.boolean(),
});
export type StreamOrderItem = z.infer<typeof StreamOrderItemSchema>;

export const UpdateStreamOrderRequestSchema = z.object({
  streams: z.array(StreamOrderItemSchema).min(0),
});
export type UpdateStreamOrderRequest = z.infer<typeof UpdateStreamOrderRequestSchema>;

export const OperationStreamVoSchema = z.object({
  id: z.string().uuid(),
  canonicalChannelId: z.string().uuid(),
  sourceChannelId: z.string().uuid().nullable(),
  streamUrl: z.string(),
  origin: z.enum(STREAM_ORIGIN),
  position: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
  eligibleForFailover: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type OperationStreamVo = z.infer<typeof OperationStreamVoSchema>;

// ---------------------------------------------------------------------------
// Failover policy (PUT /output/channels/{id}/failover-policy)
// ---------------------------------------------------------------------------
export const FailoverPolicySchema = z.object({
  mode: z.enum(FAILOVER_MODE),
  failureThreshold: z.number().int().positive(),
  recoveryThreshold: z.number().int().positive(),
  cooldownSeconds: z.number().int().nonnegative(),
});
export type FailoverPolicy = z.infer<typeof FailoverPolicySchema>;

export const FailoverPolicyVoSchema = FailoverPolicySchema.extend({
  canonicalChannelId: z.string().uuid(),
  lastSwitchAt: z.string().datetime().nullable(),
  lastSwitchReason: z.string().nullable(),
  version: z.number().int().nonnegative(),
});
export type FailoverPolicyVo = z.infer<typeof FailoverPolicyVoSchema>;
