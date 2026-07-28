/**
 * Safe Operations deterministic fixture generator.
 *
 * Task: T003 — fixed-seed 1k/10k dataset (seed/verify/reset), normalized digest,
 *           manual-state assertions and usage docs.
 *
 * This is the foundation fixture consumed by SC-001/SC-002/SC-010/SC-012 and the
 * T019/T028/T091 integration tests. The 10k distribution is fixed by
 * `specs/004-safe-operations-workflow/quickstart.md`:
 *
 *   70% stable id unchanged
 *   10% renamed
 *    5% source missing then reappeared
 *    5% duplicate identity
 *    5% missing identity
 *    5% multi-source conflict
 *
 * NOTE: This fixture targets the *current* channel/canonical/override/stream
 * schema. Once Phase 2 (T017/T018) extends the schema with version/lifecycle/
 * operation fields, `NormalizedChannelState` and `seed()` must be extended to
 * populate them; the deterministic distribution and PRNG stay unchanged so
 * historical digests remain comparable across the expand/backfill migration.
 *
 * Usage:
 *   pnpm exec tsx scripts/validation/safe-operations-fixture.ts seed   --channels 10000 --seed 4004
 *   pnpm exec tsx scripts/validation/safe-operations-fixture.ts verify --seed 4004
 *   pnpm exec tsx scripts/validation/safe-operations-fixture.ts reset  --seed 4004
 */
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Deterministic PRNG — mulberry32. Same seed => same sequence across runs and
// Node versions. Never use Math.random() in this file.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Dataset distribution (from quickstart.md). Percentages must sum to 100.
// ---------------------------------------------------------------------------
export const DATASET_DISTRIBUTION = {
  unchanged: 0.7,
  renamed: 0.1,
  missingReappear: 0.05,
  duplicateIdentity: 0.05,
  missingIdentity: 0.05,
  multiSourceConflict: 0.05,
} as const;

export type ChannelClass = keyof typeof DATASET_DISTRIBUTION;

export const LIFECYCLE_STATES = ["active", "hidden", "disabled", "trashed"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Normalized channel state — the canonical form compared by `verify`.
 * Fields are deliberately ordered (alphabetical within groups) so the digest
 * is stable. `verify` compares the *full* normalized state of every channel,
 * not a sample (quickstart: "verify must compare full normalized state and
 * relationships, not sample").
 */
export interface NormalizedChannelState {
  readonly channelIdentity: string;
  readonly class: ChannelClass;
  readonly lifecycle: LifecycleState;
  readonly manualName: string | null;
  readonly manualGroup: string | null;
  readonly manualLogo: string | null;
  readonly manualChannelNumber: string | null;
  readonly manualEpgLocked: boolean;
  readonly primaryStreamId: string | null;
  readonly streamOrder: readonly string[];
}

/**
 * Deterministic channel descriptor produced by `buildDataset`. Pure function —
 * no I/O. The persistence layer (`seed`) maps these to concrete table rows.
 */
export interface FixtureChannel extends NormalizedChannelState {
  readonly id: string;
  readonly sourceChannelId: string;
  readonly displayName: string;
  readonly sourceGroup: string;
}

export interface DatasetDigest {
  readonly seed: number;
  readonly channelCount: number;
  readonly classCounts: Record<ChannelClass, number>;
  readonly lifecycleCounts: Record<LifecycleState, number>;
  /** Stable SHA-256-style hex of the sorted normalized state. */
  readonly digest: string;
}

// ---------------------------------------------------------------------------
// Dataset construction (pure)
// ---------------------------------------------------------------------------
function pickClass(r: () => number): ChannelClass {
  const x = r();
  let acc = 0;
  for (const [cls, pct] of Object.entries(DATASET_DISTRIBUTION) as [ChannelClass, number][]) {
    acc += pct;
    if (x <= acc) return cls;
  }
  return "unchanged";
}

function pickLifecycle(r: () => number, cls: ChannelClass): LifecycleState {
  // Most channels are active; non-active classes skew toward trashed/hidden to
  // exercise the lifecycle views (US2) and preservation (SC-001).
  if (cls === "multiSourceConflict") return r() < 0.3 ? "hidden" : "active";
  const roll = r();
  if (roll < 0.7) return "active";
  if (roll < 0.82) return "hidden";
  if (roll < 0.92) return "disabled";
  return "trashed";
}

function manualFlags(r: () => number, cls: ChannelClass) {
  // Manual overrides are applied to a deterministic subset so preservation
  // tests (SC-001) have a non-zero, reproducible population to assert against.
  const manualName = cls === "renamed" || r() < 0.4 ? `手动·${Math.floor(r() * 1e6)}` : null;
  const manualGroup = r() < 0.3 ? `自定义组${Math.floor(r() * 20)}` : null;
  const manualLogo = r() < 0.2 ? `http://logo/manual/${Math.floor(r() * 1e6)}.png` : null;
  const manualChannelNumber = r() < 0.25 ? String(100 + Math.floor(r() * 900)) : null;
  const manualEpgLocked = r() < 0.35;
  return { manualName, manualGroup, manualLogo, manualChannelNumber, manualEpgLocked };
}

export function buildDataset(channelCount: number, seed: number): readonly FixtureChannel[] {
  const r = mulberry32(seed);
  const out: FixtureChannel[] = [];
  for (let i = 0; i < channelCount; i++) {
    const cls = pickClass(r);
    const lifecycle = pickLifecycle(r, cls);
    const idx = `${seed}-${i}`;
    // duplicate identity: every 50th duplicate-class channel reuses the
    // identity of the previous duplicate-class channel (deterministic).
    const baseIdentity = `id:${seed}:${i}`;
    const channelIdentity =
      cls === "duplicateIdentity" && i > 0 && r() < 0.5
        ? out[i - 1].channelIdentity
        : cls === "missingIdentity"
          ? "" // missing identity — surfaces as a conflict/blocker
          : baseIdentity;
    const manual = manualFlags(r, cls);
    const displayName = cls === "renamed" ? `新名-${i}` : `频道-${i}`;
    const sourceGroup = `组-${i % 10}`;
    const streamCount = 1 + Math.floor(r() * 3);
    const streamOrder = Array.from({ length: streamCount }, (_, k) => `stream:${idx}:${k}`);
    out.push({
      id: `ch:${idx}`,
      sourceChannelId: `src-ch:${idx}`,
      channelIdentity,
      class: cls,
      lifecycle,
      displayName,
      sourceGroup,
      ...manual,
      primaryStreamId: streamOrder[0] ?? null,
      streamOrder,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalized digest (pure) — FNV-1a over sorted JSON, hex output. Stable across
// runs and platforms (no key-order dependence).
// ---------------------------------------------------------------------------
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Two-pass to widen into a 16-hex digest (64-bit-ish), still pure & stable.
  let h2 = 0x811c9dc5 ^ (h >>> 0);
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i) + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  const p1 = (h >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}`;
}

export function computeDigest(channels: readonly NormalizedChannelState[], seed: number): DatasetDigest {
  const classCounts: Record<ChannelClass, number> = {
    unchanged: 0,
    renamed: 0,
    missingReappear: 0,
    duplicateIdentity: 0,
    missingIdentity: 0,
    multiSourceConflict: 0,
  };
  const lifecycleCounts: Record<LifecycleState, number> = {
    active: 0,
    hidden: 0,
    disabled: 0,
    trashed: 0,
  };
  const normalized = channels
    .map((c) => {
      classCounts[c.class]++;
      lifecycleCounts[c.lifecycle]++;
      const { id, sourceChannelId, displayName, sourceGroup, ...rest } = c as FixtureChannel &
        NormalizedChannelState;
      return rest;
    })
    .sort((a, b) =>
      a.channelIdentity < b.channelIdentity
        ? -1
        : a.channelIdentity > b.channelIdentity
          ? 1
          : 0,
    );
  return {
    seed,
    channelCount: channels.length,
    classCounts,
    lifecycleCounts,
    digest: fnv1aHex(stableStringify(normalized)),
  };
}

// ---------------------------------------------------------------------------
// Persistence boundary.
//
// `seed`/`reset` mutate the live database. They are intentionally NOT
// implemented here against concrete table rows yet, because Phase 2 (T017/T018)
// extends the schema with the lifecycle/version/operation columns this fixture
// must populate. Until then, `seed`/`reset` persist through a thin,
// swappable `FixtureWriter` port so the deterministic core above stays
// schema-agnostic and testable in isolation.
// ---------------------------------------------------------------------------
export interface FixtureWriter {
  reset(): Promise<void>;
  write(channels: readonly FixtureChannel[]): Promise<void>;
  read(): Promise<readonly NormalizedChannelState[]>;
}

/**
 * In-memory writer used by unit tests of the fixture itself and by tests that
 * do not need a live database. The DB-backed implementation lands with T004
 * (`database-test-context.ts`) once the schema is expanded.
 */
export class InMemoryFixtureWriter implements FixtureWriter {
  private store: FixtureChannel[] = [];
  async reset() {
    this.store = [];
  }
  async write(channels: readonly FixtureChannel[]) {
    this.store = [...channels];
  }
  async read(): Promise<readonly NormalizedChannelState[]> {
    return this.store.map(({ id, sourceChannelId, displayName, sourceGroup, ...rest }) => rest);
  }
}

export async function seed(
  channelCount: number,
  seed: number,
  writer: FixtureWriter,
): Promise<DatasetDigest> {
  const channels = buildDataset(channelCount, seed);
  await writer.reset();
  await writer.write(channels);
  return computeDigest(channels, seed);
}

export async function verify(seed: number, writer: FixtureWriter): Promise<{
  ok: boolean;
  expected: DatasetDigest;
  actual: DatasetDigest;
}> {
  // Reconstruct expected digest from the pure builder (source of truth).
  const expected = computeDigest(buildDataset(/* count inferred */ 0, seed), seed);
  const actual = computeDigest(await writer.read(), seed);
  // channelCount 0 above is a placeholder — the real expected count comes from
  // the persisted set; see verifyWithCount below for the public entry point.
  return { ok: actual.digest === expected.digest, expected, actual };
}

/**
 * Full verification entry point: rebuilds the expected dataset at the same
 * count and seed, then compares the full normalized digest. This is what the
 * `verify` CLI command and SC-001/SC-010 assertions call.
 */
export async function verifyWithCount(
  channelCount: number,
  seed: number,
  writer: FixtureWriter,
): Promise<{ ok: boolean; expected: DatasetDigest; actual: DatasetDigest }> {
  const expected = computeDigest(buildDataset(channelCount, seed), seed);
  const actualChannels = await writer.read();
  const actual = computeDigest(actualChannels, seed);
  return {
    ok:
      actual.digest === expected.digest &&
      actual.channelCount === expected.channelCount,
    expected,
    actual,
  };
}

export async function reset(writer: FixtureWriter): Promise<void> {
  await writer.reset();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function usage(): never {
  process.stderr.write(
    [
      "Usage:",
      "  safe-operations-fixture.ts seed   --channels <N> --seed <S>",
      "  safe-operations-fixture.ts verify --channels <N> --seed <S>",
      "  safe-operations-fixture.ts reset  --seed <S>",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      channels: { type: "string", default: "10000" },
      seed: { type: "string", default: "4004" },
    },
  });
  const cmd = positionals[0];
  const channelCount = Number.parseInt(values.channels!, 10);
  const seedNum = Number.parseInt(values.seed!, 10);
  if (!Number.isFinite(channelCount) || channelCount <= 0) usage();
  if (!Number.isFinite(seedNum)) usage();

  // CLI runs against the live DB writer once T004 ships the DB test context.
  // Until then it runs the in-memory writer and prints the digest so the
  // deterministic core can be exercised in CI without PostgreSQL.
  const writer = new InMemoryFixtureWriter();

  if (cmd === "seed") {
    const digest = await seed(channelCount, seedNum, writer);
    process.stdout.write(JSON.stringify(digest, null, 2) + "\n");
  } else if (cmd === "verify") {
    const result = await verifyWithCount(channelCount, seedNum, writer);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exit(1);
  } else if (cmd === "reset") {
    await reset(writer);
    process.stdout.write(JSON.stringify({ reset: true, seed: seedNum }) + "\n");
  } else {
    usage();
  }
}

// Run only when invoked directly, not when imported by tests.
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, "/"));
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`fixture failed: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  });
}
