/**
 * Secret redaction helpers (009-m3u-control-plane T055).
 *
 * Single source of truth for stripping secrets from:
 *   - playlist URLs (`?grant=<plaintext>`)
 *   - audit event payloads (source headers, grant plaintext, playback URLs)
 *   - error response summaries
 *   - structured log context
 *
 * The grant prefix is intentionally sourced from the canonical constant so
 * changes to the prefix automatically propagate.
 */
import { GRANT_TOKEN_PREFIX } from "@/application/output-composition/output-grant.use-cases";

/** Strip the grant query param's value from a URL, preserving other params. */
export function redactGrantFromUrl(url: string): string {
  if (!url.includes("grant=")) return url;
  return url.replace(/grant=[^&]+/, "grant=<redacted>");
}

/** Returns true when the string looks like a grant plaintext token. */
export function isGrantPlaintext(value: string): boolean {
  return typeof value === "string" && value.startsWith(GRANT_TOKEN_PREFIX);
}

/**
 * Redact every secret in `payload` (a string or stringified object). Secrets
 * are matched verbatim (escaped for regex) so this is safe to use with tokens
 * containing regex meta-characters.
 *
 * The function does NOT scan for "anything that looks like a secret"; callers
 * must explicitly pass the secrets they want redacted. This is intentional —
 * pattern-matching secrets produces false negatives.
 */
export function redactSecrets(payload: string, secrets: readonly string[]): string {
  if (secrets.length === 0) return payload;
  let out = payload;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join("<redacted>");
  }
  return out;
}

/** Convenience: redact a structured object's JSON form, returning a string. */
export function redactSecretsFromObject(
  payload: unknown,
  secrets: readonly string[],
): string {
  return redactSecrets(safeStringify(payload), secrets);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
