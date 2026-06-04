import { describe, it, expect } from "vitest";
import { EpgMatcher } from "../epg-matcher";

const xmltvChannels = [
  { id: "cctv1", displayName: "CCTV-1 综合" },
  { id: "cctv2", displayName: "CCTV-2 财经" },
  { id: "cctv13", displayName: "CCTV-13 新闻" },
  { id: "hunan", displayName: "湖南卫视" },
];

describe("EpgMatcher", () => {
  const matcher = new EpgMatcher();

  it("matches by manual override", () => {
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: null,
      channelDisplayName: "Some Channel",
      manualEpgChannelId: "cctv1",
      xmltvChannels,
    });
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("manual");
    expect(result.confidence).toBe(1);
  });

  it("matches by tvg-id", () => {
    const result = matcher.match({
      channelTvgId: "cctv2",
      channelTvgName: null,
      channelDisplayName: "Random Name",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("tvg-id");
    expect(result.xmltvChannelId).toBe("cctv2");
  });

  it("matches by tvg-name", () => {
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: "CCTV-13 新闻",
      channelDisplayName: "Random",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("tvg-name");
    expect(result.xmltvChannelId).toBe("cctv13");
  });

  it("matches by display-name", () => {
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: null,
      channelDisplayName: "CCTV-1 综合",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matched).toBe(true);
    expect(result.matchType).toBe("display-name");
    expect(result.xmltvChannelId).toBe("cctv1");
  });

  it("matches by fuzzy similarity", () => {
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: null,
      channelDisplayName: "湖南卫视 ",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matched).toBe(true);
    expect(result.xmltvChannelId).toBe("hunan");
  });

  it("returns unmatched when no match found", () => {
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: null,
      channelDisplayName: "XYZ Unknown Channel",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matched).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  it("returns conflict when multiple strong matches", () => {
    const channels = [
      { id: "a", displayName: "CCTV News" },
      { id: "b", displayName: "CCTV News HD" },
    ];
    const result = matcher.match({
      channelTvgId: null,
      channelTvgName: null,
      channelDisplayName: "CCTV News",
      manualEpgChannelId: null,
      xmltvChannels: channels,
    });
    expect(result.matched).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("prioritizes manual over tvg-id", () => {
    const result = matcher.match({
      channelTvgId: "cctv2",
      channelTvgName: null,
      channelDisplayName: "Random",
      manualEpgChannelId: "cctv1",
      xmltvChannels,
    });
    expect(result.matchType).toBe("manual");
    expect(result.xmltvChannelId).toBe("cctv1");
  });

  it("prioritizes tvg-id over display-name", () => {
    const result = matcher.match({
      channelTvgId: "cctv13",
      channelTvgName: null,
      channelDisplayName: "CCTV-1 综合",
      manualEpgChannelId: null,
      xmltvChannels,
    });
    expect(result.matchType).toBe("tvg-id");
    expect(result.xmltvChannelId).toBe("cctv13");
  });
});
