/**
 * Open API read query DTOs (005-open-channels-epg-api).
 *
 * Zod is the single source of truth (constitution V). These validate the
 * public read surface (/api/open/v1/*). `from`/`to` are required ISO-8601
 * timestamps; the EPG window is capped at 7 days (FR-014).
 */
import { z } from "zod";
import { PaginationQuerySchema } from "./index";

/** Open API channels list query. */
export const OpenChannelsQuerySchema = PaginationQuerySchema.extend({
  group: z.string().optional(),
  search: z.string().optional(),
});
export type OpenChannelsQuery = z.infer<typeof OpenChannelsQuerySchema>;

/** Open API single-channel detail path. Accepts `magi:{id}` or bare id. */
export const OpenChannelIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .transform((v) => (v.startsWith("magi:") ? v.slice(5) : v)),
});
export type OpenChannelIdParam = z.infer<typeof OpenChannelIdParamSchema>;

/**
 * Open API EPG query. `to - from` MUST be <= 7 days (FR-014) and `from < to`.
 * `channelId` accepts `magi:{id}` or bare id (normalized like the path param).
 */
export const OpenEpgQuerySchema = PaginationQuerySchema.extend({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  group: z.string().optional(),
  channelId: z
    .string()
    .optional()
    .transform((v) => (v && v.startsWith("magi:") ? v.slice(5) : v)),
  search: z.string().optional(),
}).refine((q) => new Date(q.from) < new Date(q.to), {
  message: "from must be before to",
  path: ["from"],
}).refine(
  (q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= 7 * 24 * 60 * 60 * 1000,
  { message: "EPG window must not exceed 7 days", path: ["to"] },
);
export type OpenEpgQuery = z.infer<typeof OpenEpgQuerySchema>;
