/**
 * Secret utilities for the OAuth2 Client Credentials Grant (004-safe-operations).
 *
 * Both client secrets and access tokens use the same security model: generate a
 * plaintext with a recognisable prefix, store only its SHA-256 hash, and keep a
 * masked prefix for list display. The plaintext is returned exactly once.
 *
 * These supersede the old generateApiKeyPlaintext / hashApiKey / maskKeyPrefix
 * helpers that lived in api-key.guard.ts.
 */
import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex of any plaintext secret (client secret or access token). */
export function hashSecret(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generate a new client_secret plaintext: `magi_secret_<32 base62>`. */
export function generateClientSecret(): string {
  return `magi_secret_${randomBytes(24).toString("base64url").slice(0, 32)}`;
}

/** Generate a new access_token plaintext: `tok_<40 base62>`. */
export function generateAccessToken(): string {
  return `tok_${randomBytes(30).toString("base64url").slice(0, 40)}`;
}

/** Masked prefix for list display, e.g. `magi_s…`. */
export function maskSecretPrefix(plaintext: string): string {
  return `${plaintext.slice(0, 7)}…`;
}

/** Default access-token lifetime: 1 hour. */
export const ACCESS_TOKEN_TTL_SECONDS = 3600;
