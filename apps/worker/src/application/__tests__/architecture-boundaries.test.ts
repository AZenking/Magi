/**
 * Worker architecture boundary tests (T032) — RED→GREEN.
 *
 * Guards constitution III (Domain Independence): the Worker `application/` and
 * `domain/` layers MUST NOT import Drizzle, BullMQ, or Node filesystem. These
 * scan the source files statically so they fail loudly on the next regression.
 *
 * This test PASSES today (the boundary established in T027 is clean) and stays
 * green as long as no one adds a forbidden import.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");

const FORBIDDEN_PATTERNS = [
  /from\s+["']drizzle-orm["']/,
  /from\s+["']bullmq["']/,
  /from\s+["']ioredis["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']fs["']/,
  /from\s+["']node:path["']/,
];

function listTsFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return listTsFiles(full);
      if (e.isFile() && /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) return [full];
      return [];
    });
  } catch {
    return [];
  }
}

describe("Worker Clean Architecture boundaries (T032)", () => {
  it("application/ never imports Drizzle / BullMQ / fs", () => {
    const files = listTsFiles(join(ROOT, "src", "application"));
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(src)) violations.push(`${f}: matches ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("domain/ never imports Drizzle / BullMQ / fs", () => {
    const files = listTsFiles(join(ROOT, "src", "domain"));
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(src)) violations.push(`${f}: matches ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("JobRunner depends only on domain ports (no infrastructure imports)", () => {
    const src = readFileSync(join(ROOT, "src", "application", "job-runner.ts"), "utf8");
    // Allowed imports: relative domain paths, backend-core, types.
    const imports = src.match(/from\s+["']([^"']+)["']/g) ?? [];
    const disallowed = imports.filter((imp) =>
      /drizzle|bullmq|ioredis|node:fs|["']fs["']/.test(imp),
    );
    expect(disallowed).toEqual([]);
  });
});
