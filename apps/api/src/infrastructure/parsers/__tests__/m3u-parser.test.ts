import { describe, it, expect } from "vitest";
import { parseM3U, generateChannelIdentity, normalizeChannelName } from "../m3u-parser";

describe("parseM3U", () => {
  it("parses a valid M3U with multiple entries", () => {
    const raw = `#EXTM3U
#EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV-1" tvg-logo="http://logo/1.png" group-title="央视",CCTV-1 综合
http://stream.example.com/cctv1
#EXTINF:-1 tvg-id="cctv2" tvg-name="CCTV-2" tvg-logo="http://logo/2.png" group-title="央视",CCTV-2 财经
http://stream.example.com/cctv2`;

    const entries = parseM3U(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      displayName: "CCTV-1 综合",
      tvgId: "cctv1",
      tvgName: "CCTV-1",
      tvgLogo: "http://logo/1.png",
      groupTitle: "央视",
      streamUrl: "http://stream.example.com/cctv1",
    });
    expect(entries[1]!.displayName).toBe("CCTV-2 财经");
  });

  it("handles entries without tvg attributes", () => {
    const raw = `#EXTM3U
#EXTINF:-1,My Channel
http://stream.example.com/my`;

    const entries = parseM3U(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tvgId).toBe("");
    expect(entries[0]!.displayName).toBe("My Channel");
  });

  it("returns empty array for empty input", () => {
    expect(parseM3U("")).toEqual([]);
  });

  it("skips entries without stream URL", () => {
    const raw = `#EXTM3U
#EXTINF:-1 tvg-id="x",No URL
#EXTINF:-1 tvg-id="y",Has URL
http://stream.example.com/y`;

    const entries = parseM3U(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tvgId).toBe("y");
  });

  it("skips comment lines between entries", () => {
    const raw = `#EXTM3U
#EXTINF:-1 tvg-id="a",Channel A
# Some comment
http://stream.example.com/a`;

    const entries = parseM3U(raw);
    expect(entries).toHaveLength(1);
  });
});

describe("generateChannelIdentity", () => {
  const sourceId = "src-123";

  it("uses tvg-id when available", () => {
    const identity = generateChannelIdentity(sourceId, {
      displayName: "Ch",
      tvgId: "cctv1",
      tvgName: "",
      tvgLogo: "",
      groupTitle: "",
      streamUrl: "http://x.com/s",
    });
    expect(identity).toBe("src-123::tvg-id::cctv1");
  });

  it("falls back to stream URL when no tvg-id", () => {
    const identity = generateChannelIdentity(sourceId, {
      displayName: "Ch",
      tvgId: "",
      tvgName: "",
      tvgLogo: "",
      groupTitle: "News",
      streamUrl: "http://x.com/s",
    });
    expect(identity).toBe("src-123::url::http://x.com/s");
  });

  it("falls back to normalized name + group when no tvg-id or url", () => {
    const identity = generateChannelIdentity(sourceId, {
      displayName: "My Channel",
      tvgId: "",
      tvgName: "",
      tvgLogo: "",
      groupTitle: "News",
      streamUrl: "",
    });
    expect(identity).toContain("src-123::name::");
    expect(identity).toContain("my channel");
  });
});

describe("normalizeChannelName", () => {
  it("lowercases and normalizes whitespace", () => {
    expect(normalizeChannelName("CCTV-1_HD  综合频道")).toBe("cctv 1 hd 综合频道");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeChannelName("  hello  ")).toBe("hello");
  });
});
