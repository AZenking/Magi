/**
 * OAuth2 Client Credentials Grant DTOs (004-safe-operations).
 *
 * Zod is the single source of truth (constitution V). These schemas validate
 * both the token endpoint (/api/open/v1/auth/token) and the admin management
 * surface (/api/admin/oauth-clients/*).
 */
import { z } from "zod";
import { PaginationQuerySchema } from "./index";

// --- Token endpoint request/response ---

export const TokenRequestSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1).max(64),
  client_secret: z.string().min(1).max(128),
});
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

// --- Admin management ---

export const CreateOauthClientSchema = z.object({
  clientId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "clientId may only contain letters, digits, _ and -"),
  clientName: z.string().min(1).max(120),
});
export type CreateOauthClient = z.infer<typeof CreateOauthClientSchema>;

export const ListOauthClientsQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["active", "disabled", "revoked"]).optional(),
  search: z.string().optional(),
});
export type ListOauthClientsQuery = z.infer<typeof ListOauthClientsQuerySchema>;
