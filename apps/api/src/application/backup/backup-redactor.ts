/**
 * BackupRedactor (T100).
 *
 * Pure function that redacts known sensitive fields from any backup payload,
 * audit summary, task summary or log context before persistence or output
 * (constitution VII, FR-019/FR-020, research §12). Never invents new secrets;
 * only removes known patterns.
 */
const SENSITIVE_KEYS = /^(password|passwd|secret|token|cookie|authorization|apiKey|api_key|refreshToken|accessToken)$/i;
const SENSITIVE_QUERY_PARAMS = /(api_key|token|password|secret|access_token|refresh_token)=[^&]*/gi;

/** Redact sensitive values in a JSON-serializable object (deep clone, never mutates input). */
export function redact<T>(value: T): T {
  return deepRedact(JSON.parse(JSON.stringify(value))) as T;
}

function deepRedact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepRedact);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof val === "string" && val.startsWith("Bearer ")) {
      out[key] = "Bearer [redacted]";
    } else if (typeof val === "string" && key.toLowerCase().includes("url")) {
      out[key] = redactUrl(val);
    } else if (typeof val === "string" && (key.toLowerCase().includes("header") || key.toLowerCase().includes("headers"))) {
      out[key] = redactHeadersString(val);
    } else {
      out[key] = deepRedact(val);
    }
  }
  return out;
}

/** Redact userinfo + sensitive query params from a URL string. */
export function redactUrl(url: string): string {
  let result = url.replace(/\/\/[^/@]+@/, "//[redacted]@");
  result = result.replace(SENSITIVE_QUERY_PARAMS, "$1=[redacted]");
  return result;
}

/** Redact sensitive header values from a header-like string or JSON. */
export function redactHeadersString(raw: string): string {
  return raw.replace(
    /"(Authorization|X-Api-Key|apiKey|Cookie|Set-Cookie)"\s*:\s*"[^"]*"/gi,
    '"$1":"[redacted]"',
  );
}
