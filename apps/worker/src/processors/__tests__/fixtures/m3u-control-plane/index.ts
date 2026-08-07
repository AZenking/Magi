/**
 * M3U control-plane fixture catalog (T001).
 *
 * Each fixture is a versioned, deterministic M3U payload that maps to a
 * scenario in `specs/009-m3u-control-plane/quickstart.md`. Fixtures are
 * intentionally small and human-readable; integration tests load them as raw
 * strings so worker M3U parsing sees the exact bytes a real download would
 * deliver.
 *
 * Naming convention: `<scenario>[-<variant>].m3u`. Variants reuse the same
 * upstream identity across files so diff/identity tests can chain snapshots.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = __dirname;

export type FixtureName =
  | "normal"
  | "normalV2"
  | "empty"
  | "baselineFour"
  | "deletion25Percent"
  | "sameTvgId"
  | "weakMatch"
  | "reappearingLine"
  | "lineDisappears";

const fileByName: Readonly<Record<FixtureName, string>> = {
  normal: "normal.m3u",
  normalV2: "normal-v2.m3u",
  empty: "empty.m3u",
  baselineFour: "baseline-four.m3u",
  deletion25Percent: "deletion-25-percent.m3u",
  sameTvgId: "same-tvg-id.m3u",
  weakMatch: "weak-match.m3u",
  reappearingLine: "reappearing-line.m3u",
  lineDisappears: "line-disappears.m3u",
};

/** Read a fixture file as raw UTF-8 text (the bytes a download would deliver). */
export function readM3uFixture(name: FixtureName): string {
  return readFileSync(join(here, fileByName[name]), "utf8");
}
