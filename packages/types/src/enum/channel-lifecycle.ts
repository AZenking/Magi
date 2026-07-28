/**
 * Channel lifecycle & source-presence enums (T007).
 *
 * Single lifecycle state machine (research §10, data-model.md CanonicalChannel).
 * Orthogonal to source presence — external facts never change operator intent.
 */

/** Single source of lifecycle truth. */
export const CHANNEL_LIFECYCLE = ["active", "hidden", "disabled", "trashed"] as const;
export type ChannelLifecycle = (typeof CHANNEL_LIFECYCLE)[number];

/**
 * Whether a source channel currently appears in upstream input.
 * Orthogonal to lifecycle (FR-014, data-model.md SourceChannel.sourcePresence).
 */
export const SOURCE_PRESENCE = ["present", "missing", "conflict"] as const;
export type SourcePresence = (typeof SOURCE_PRESENCE)[number];

/** Origin of a stream (manual streams survive source sync). */
export const STREAM_ORIGIN = ["source", "manual"] as const;
export type StreamOrigin = (typeof STREAM_ORIGIN)[number];

/**
 * Allowed reversible lifecycle transitions (contracts/channels.md).
 * `trashed → purge` is intentionally NOT here — purge is a separate operation.
 */
export const LIFECYCLE_TRANSITIONS: ReadonlyArray<
  [ChannelLifecycle, ChannelLifecycle]
> = [
  ["active", "hidden"],
  ["hidden", "active"],
  ["active", "disabled"],
  ["disabled", "active"],
  ["hidden", "disabled"],
  ["disabled", "hidden"],
  ["active", "trashed"],
  ["hidden", "trashed"],
  ["disabled", "trashed"],
  ["trashed", "active"],
  ["trashed", "hidden"],
  ["trashed", "disabled"],
];

export function canTransition(from: ChannelLifecycle, to: ChannelLifecycle): boolean {
  return LIFECYCLE_TRANSITIONS.some(([f, t]) => f === from && t === to);
}
