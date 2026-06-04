import { describe, it, expect } from "vitest";
import { parseXMLTV, parseXmltvDate, isInEpgWindow } from "../xmltv-parser";

function formatXmltvDate(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())} +0000`;
}

describe("parseXMLTV", () => {
  it("parses channels and programmes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="cctv1">
    <display-name>CCTV-1</display-name>
    <icon src="http://logo/1.png"/>
  </channel>
  <channel id="cctv2">
    <display-name>CCTV-2</display-name>
  </channel>
  <programme start="20250101060000 +0800" stop="20250101070000 +0800" channel="cctv1">
    <title>早间新闻</title>
    <desc>今日新闻概览</desc>
    <category>新闻</category>
  </programme>
  <programme start="20250101070000 +0800" stop="20250101080000 +0800" channel="cctv2">
    <title>财经报道</title>
  </programme>
</tv>`;

    const data = parseXMLTV(xml);
    expect(data.channels).toHaveLength(2);
    expect(data.channels[0]).toEqual({
      id: "cctv1",
      displayName: "CCTV-1",
      icon: "http://logo/1.png",
    });
    expect(data.channels[1]).toEqual({
      id: "cctv2",
      displayName: "CCTV-2",
      icon: "",
    });

    expect(data.programmes).toHaveLength(2);
    expect(data.programmes[0]!.title).toBe("早间新闻");
    expect(data.programmes[0]!.channel).toBe("cctv1");
    expect(data.programmes[0]!.desc).toBe("今日新闻概览");
    expect(data.programmes[0]!.category).toBe("新闻");
  });

  it("returns empty arrays for empty XML", () => {
    const data = parseXMLTV("<tv></tv>");
    expect(data.channels).toEqual([]);
    expect(data.programmes).toEqual([]);
  });

  it("handles XML entities", () => {
    const xml = `<tv>
  <channel id="ch1">
    <display-name>AT&amp;T Channel</display-name>
  </channel>
</tv>`;

    const data = parseXMLTV(xml);
    expect(data.channels[0]!.displayName).toBe("AT&T Channel");
  });
});

describe("parseXmltvDate", () => {
  it("parses standard XMLTV date with timezone", () => {
    const date = parseXmltvDate("20250115060000 +0800");
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(15);
    expect(date.getUTCHours()).toBe(6);
  });

  it("parses date without timezone", () => {
    const date = parseXmltvDate("20250115060000");
    expect(date.getUTCFullYear()).toBe(2025);
  });

  it("returns epoch for invalid date", () => {
    const date = parseXmltvDate("invalid");
    expect(date.getTime()).toBe(0);
  });
});

describe("isInEpgWindow", () => {
  it("returns true for current time window", () => {
    const now = new Date();
    const startMs = now.getTime() - 3600000;
    const stopMs = now.getTime() + 3600000;
    const start = formatXmltvDate(new Date(startMs));
    const stop = formatXmltvDate(new Date(stopMs));
    expect(isInEpgWindow(start, stop)).toBe(true);
  });

  it("returns false for far-future programmes", () => {
    expect(isInEpgWindow("20990101060000 +0000", "20990101070000 +0000")).toBe(false);
  });

  it("returns false for long-past programmes", () => {
    expect(isInEpgWindow("20200101060000 +0000", "20200101070000 +0000")).toBe(false);
  });
});
