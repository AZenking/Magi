/**
 * API Key management DTOs (005-open-channels-epg-api).
 *
 * Zod is the single source of truth (constitution V). These schemas validate
 * the admin management surface (/api/admin/api-keys/*). The plaintext key
 * itself is generated server-side, never accepted as input.
 */
import { z } from "zod";
import { PaginationQuerySchema } from "./index";

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .refine(
      (v) => !v || new Date(v).getTime() > Date.now(),
      "expiresAt must be in the future",
    ),
});
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;

export const ListApiKeysQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["active", "disabled", "revoked"]).optional(),
  search: z.string().optional(),
});
export type ListApiKeysQuery = z.infer<typeof ListApiKeysQuerySchema>;
