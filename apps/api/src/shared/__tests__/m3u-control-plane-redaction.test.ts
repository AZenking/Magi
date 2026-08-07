/**
 * Audit/log redaction tests (009-m3u-control-plane T055).
 *
 * Verifies that no audit entry, structured log line, or error response
 * contains the secrets the feature handles:
 *   - source headers (Authorization, Cookie, custom)
 *   - grant plaintext tokens (mg_pl_...)
 *   - playlist URLs with `?grant=...` query strings
 *   - playback URLs (per-stream streamUrl)
 *
 * The redactor is the single helper used by audit + logging + the playlist
 * guard. Tests pin its behavior so future call sites can't accidentally leak.
 */
import { describe, it, expect } from "vitest";
import {
  redactGrantFromUrl,
  redactSecrets,
  isGrantPlaintext,
} from "@/shared/redact";

describe("URL redaction (T055, 009)", () => {
  it("strips the grant query param from a playlist URL", () => {
    const url = "https://magi.local/api/playlist/v2.m3u?grant=mg_pl_secret-xyz";
    expect(redactGrantFromUrl(url)).toBe(
      "https://magi.local/api/playlist/v2.m3u?grant=<redacted>",
    );
  });

  it("preserves other query params when stripping grant", () => {
    const url = "https://magi.local/api/playlist/v2.m3u?grant=mg_pl_secret&foo=bar";
    expect(redactGrantFromUrl(url)).toContain("foo=bar");
    expect(redactGrantFromUrl(url)).not.toContain("mg_pl_secret");
  });

  it("returns the URL unchanged when no grant param is present", () => {
    const url = "https://magi.local/api/open/v1/epg";
    expect(redactGrantFromUrl(url)).toBe(url);
  });
});

describe("Secret detection (T055, 009)", () => {
  it("isGrantPlaintext returns true for mg_pl_ prefixed tokens", () => {
    expect(isGrantPlaintext("mg_pl_abc123xyz")).toBe(true);
  });

  it("isGrantPlaintext returns false for unrelated strings", () => {
    expect(isGrantPlaintext("Bearer xxx")).toBe(false);
    expect(isGrantPlaintext("")).toBe(false);
    expect(isGrantPlaintext("sk_live_xxx")).toBe(false);
  });
});

describe("Full-secret redaction (T055, 009)", () => {
  it("replaces grant plaintext anywhere in a payload", () => {
    const input = "User created grant mg_pl_secret-xyz for player A";
    expect(redactSecrets(input, ["mg_pl_secret-xyz"])).toBe(
      "User created grant <redacted> for player A",
    );
  });

  it("redacts source Authorization headers from audit payloads", () => {
    const input = JSON.stringify({
      sourceId: "src-1",
      headers: { Authorization: "Bearer secret-jwt" },
    });
    const out = redactSecrets(input, ["Bearer secret-jwt"]);
    expect(out).not.toContain("secret-jwt");
    expect(out).toContain("<redacted>");
  });

  it("redacts multiple secrets in the same payload", () => {
    const input = "tokens: mg_pl_aaa and mg_pl_bbb";
    const out = redactSecrets(input, ["mg_pl_aaa", "mg_pl_bbb"]);
    expect(out).toBe("tokens: <redacted> and <redacted>");
  });

  it("does not mutate the input when no secrets are present", () => {
    const input = "no secrets here";
    expect(redactSecrets(input, [])).toBe(input);
  });

  it("handles regex meta-characters in secrets safely", () => {
    const input = "secret: mg_pl_$pecial.*+?[]";
    const out = redactSecrets(input, ["mg_pl_$pecial.*+?[]"]);
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("mg_pl_$pecial");
  });
});
