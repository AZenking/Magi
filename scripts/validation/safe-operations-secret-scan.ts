/**
 * Safe Operations secret scanner (T127).
 *
 * Scans backup payloads, audit summaries, task summaries and log lines for
 * known secret patterns (URLs with userinfo, Authorization headers, passwords,
 * tokens, cookies). Used by the release gate to assert zero secret exposure
 * (constitution VII, FR-019/FR-020, quickstart Scenario 12).
 *
 * Usage:
 *   pnpm exec tsx scripts/validation/safe-operations-secret-scan.ts --input <file-or-json>
 */
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "url-userinfo", pattern: /\/\/[^/@\s]+:[^/@\s]+@/ },
  { name: "authorization-header", pattern: /"(Authorization|X-Api-Key)"\s*:\s*"[^"]+"/i },
  { name: "bearer-token", pattern: /Bearer\s+[A-Za-z0-9._-]{8,}/ },
  { name: "password-field", pattern: /"(password|passwd)"\s*:\s*"[^"]+"/i },
  { name: "token-field", pattern: /"(token|secret|cookie|refreshToken|accessToken)"\s*:\s*"[^"]{4,}"/i },
  { name: "sensitive-query", pattern: /[?&](api_key|token|password|secret)=[^&\s]{4,}/i },
];

export interface ScanResult {
  ok: boolean;
  findings: Array<{ name: string; line: number; snippet: string }>;
}

/** Scan a JSON/text blob for known secret patterns. */
export function scanForSecrets(content: string): ScanResult {
  const findings: Array<{ name: string; line: number; snippet: string }> = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(lines[i]!)) {
        findings.push({ name, line: i + 1, snippet: lines[i]!.slice(0, 80) });
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

async function main() {
  const { values } = parseArgs({
    options: { input: { type: "string" } },
  });
  const content = values.input
    ? readFileSync(values.input, "utf8")
    : JSON.stringify({ test: "Bearer fake-token-12345", password: "zxcv" });
  const result = scanForSecrets(content);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, "/"));
if (invokedDirectly) main();
