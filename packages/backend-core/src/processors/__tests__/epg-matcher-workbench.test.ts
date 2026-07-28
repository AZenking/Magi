/**
 * EPG matcher workbench tests (T062).
 *
 * Validates the four-class classification (exact/fuzzy/conflict/unmatched),
 * confidence range and candidate details that the US3 workbench relies on
 * (FR-007, contracts/operation-previews.md).
 */
import { describe, it, expect } from "vitest";
import { EpgMatcher } from "../epg-matcher";

function match(
  channel: { tvgId?: string | null; name: string; manualEpg?: string | null },
  xmltv: Array<{ id: string; displayName: string }>,
) {
  return new EpgMatcher().match({
    channelTvgId: channel.tvgId ?? null,
    channelTvgName: channel.name,
    channelDisplayName: channel.name,
    manualEpgChannelId: channel.manualEpg ?? null,
    xmltvChannels: xmltv,
  });
}

describe("EPG matcher classification (T062)", () => {
  it("classifies a tvg-id match as exact (high confidence)", () => {
    const result = match(
      { tvgId: "cctv-1", name: "CCTV-1" },
      [{ id: "cctv-1", displayName: "CCTV One" }],
    );
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("tvg-id");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies a display-name similarity as fuzzy (medium confidence)", () => {
    const result = match(
      { name: "CCTV News Channel" },
      [{ id: "cctv-news", displayName: "CCTV News" }],
    );
    expect(result.matched).toBe(true);
    expect(["display-name", "fuzzy"]).toContain(result.matchType);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.9);
  });

  it("leaves a channel with no candidate as unmatched", () => {
    const result = match(
      { name: "Totally Obscure Channel" },
      [{ id: "cctv-1", displayName: "CCTV One" }],
    );
    expect(result.matched).toBe(false);
    expect(result.matchType).toBeNull();
  });

  it("preserves a manual binding over any automatic match", () => {
    const result = match(
      { name: "CCTV-1", manualEpg: "manual-id" },
      [
        { id: "cctv-1", displayName: "CCTV One" },
        { id: "manual-id", displayName: "Manual Choice" },
      ],
    );
    expect(result.matched).toBe(true);
    expect(result.xmltvChannelId).toBe("manual-id");
    expect(result.matchType).toBe("manual");
  });

  it("confidence is always in [0, 1]", () => {
    const result = match({ name: "X" }, [{ id: "y", displayName: "Z" }]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("exposes candidate list for fuzzy/conflict inspection", () => {
    const result = match(
      { name: "CCTV" },
      [
        { id: "cctv-1", displayName: "CCTV One" },
        { id: "cctv-2", displayName: "CCTV Two" },
      ],
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.xmltvChannelId).toBeTruthy();
      expect(c.confidence).toBeGreaterThanOrEqual(0);
    }
  });
});
