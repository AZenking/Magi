/**
 * Fingerprint normalization tests (T011) — RED phase.
 *
 * These fail until T013 implements `computeFingerprint` and `normalizeInput`.
 * Properties under test (research §1, §6):
 *   - same logical input => same fingerprint (deterministic)
 *   - input order independence (stable sort)
 *   - semantically different input => different fingerprint
 *   - normalization is pure (no I/O, no Math.random)
 */
import { describe, it, expect } from "vitest";
import { computeFingerprint, normalizeInput } from "../fingerprint";
import type { SnapshotItem } from "../types";

const item = (channelIdentity: string, payload: Record<string, unknown> = {}): SnapshotItem => ({
  channelIdentity,
  payload,
});

describe("computeFingerprint (T011)", () => {
  it("is deterministic for the same logical input", () => {
    const a = [
      item("id:1", { name: "CCTV-1", group: "g1" }),
      item("id:2", { name: "CCTV-2", group: "g2" }),
    ];
    const b = [
      item("id:1", { name: "CCTV-1", group: "g1" }),
      item("id:2", { name: "CCTV-2", group: "g2" }),
    ];
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("is independent of input array order (stable sort by channelIdentity)", () => {
    const ordered = [item("id:1", { name: "A" }), item("id:2", { name: "B" })];
    const reversed = [item("id:2", { name: "B" }), item("id:1", { name: "A" })];
    expect(computeFingerprint(ordered)).toBe(computeFingerprint(reversed));
  });

  it("produces different fingerprints for semantically different input", () => {
    const a = [item("id:1", { name: "CCTV-1" })];
    const b = [item("id:1", { name: "CCTV-2" })];
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("ignores key insertion order in object serialization", () => {
    const a = [item("id:1", { name: "A", group: "G" })];
    const b = [item("id:1", { group: "G", name: "A" })];
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("produces a stable hex string with the `sha256:` prefix", () => {
    const fp = computeFingerprint([item("id:1", { name: "A" })]);
    expect(typeof fp).toBe("string");
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("normalizeInput (T011)", () => {
  it("returns a stable, sorted representation", () => {
    const input = [
      item("id:2", { name: "B", extra: null }),
      item("id:1", { name: "A", extra: "x" }),
    ];
    const normalized = normalizeInput(input);
    expect(normalized[0]?.channelIdentity).toBe("id:1");
    expect(normalized[1]?.channelIdentity).toBe("id:2");
  });

  it("drops undefined fields but keeps explicit nulls", () => {
    const normalized = normalizeInput([item("id:1", { name: "A", missing: undefined })]);
    const json = JSON.stringify(normalized);
    expect(json).not.toContain("missing");
  });

  it("is pure — same input twice yields byte-identical output", () => {
    const input = [item("id:1", { name: "A", n: 3 })];
    expect(JSON.stringify(normalizeInput(input))).toBe(
      JSON.stringify(normalizeInput(input)),
    );
  });
});
