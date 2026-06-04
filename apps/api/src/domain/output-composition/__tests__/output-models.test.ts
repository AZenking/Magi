import { describe, it, expect } from "vitest";
import { CanonicalChannelModel, type CanonicalChannel } from "../canonical-channel.model";
import { ChannelStreamModel, type ChannelStream } from "../channel-stream.model";

function createCanonical(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "cc-1",
    standardName: "CCTV-1",
    standardGroup: "央视",
    standardLogo: "http://logo/1.png",
    channelNumber: null,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: "cctv1",
    epgMatchType: "tvg-id",
    epgStatus: "matched_auto",
    outputStatus: "active",
    qualityScore: null,
    primaryStreamId: null,
    mergedFromIds: null,
    mergeMethod: null,
    conflictNote: null,
    lastMergedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createStream(overrides: Partial<ChannelStream> = {}): ChannelStream {
  return {
    id: "cs-1",
    canonicalChannelId: "cc-1",
    m3uSourceId: "src-1",
    rawChannelId: null,
    sourceChannelId: null,
    streamUrl: "http://stream.example.com/1",
    isPrimary: false,
    healthStatus: "unknown",
    responseTime: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    successRate: null,
    streamError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("CanonicalChannelModel", () => {
  it("shouldBeInOutput when visible and enabled", () => {
    expect(new CanonicalChannelModel(createCanonical()).shouldBeInOutput()).toBe(true);
  });

  it("not in output when hidden", () => {
    expect(new CanonicalChannelModel(createCanonical({ hidden: true })).shouldBeInOutput()).toBe(false);
  });

  it("not in output when disabled", () => {
    expect(new CanonicalChannelModel(createCanonical({ disabled: true })).shouldBeInOutput()).toBe(false);
  });

  it("hasEpg when epgChannelId is set and status matched", () => {
    expect(new CanonicalChannelModel(createCanonical()).hasEpg()).toBe(true);
  });

  it("no Epg when unmatched", () => {
    expect(new CanonicalChannelModel(createCanonical({ epgChannelId: null, epgStatus: "unmatched" })).hasEpg()).toBe(false);
  });

  it("isHealthy when outputStatus is active", () => {
    expect(new CanonicalChannelModel(createCanonical()).isHealthy()).toBe(true);
  });

  it("not healthy when degraded", () => {
    expect(new CanonicalChannelModel(createCanonical({ outputStatus: "degraded" })).isHealthy()).toBe(false);
  });
});

describe("ChannelStreamModel", () => {
  it("isAvailable for online stream", () => {
    expect(new ChannelStreamModel(createStream({ healthStatus: "online" })).isAvailable()).toBe(true);
  });

  it("isAvailable for unknown stream", () => {
    expect(new ChannelStreamModel(createStream({ healthStatus: "unknown" })).isAvailable()).toBe(true);
  });

  it("not available for offline stream", () => {
    expect(new ChannelStreamModel(createStream({ healthStatus: "offline" })).isAvailable()).toBe(false);
  });

  it("online is better than unknown", () => {
    const online = createStream({ healthStatus: "online" });
    const unknown = createStream({ healthStatus: "unknown" });
    expect(new ChannelStreamModel(online).isBetterThan(unknown)).toBe(true);
  });

  it("higher success rate wins", () => {
    const a = createStream({ healthStatus: "online", successRate: 0.95 });
    const b = createStream({ healthStatus: "online", successRate: 0.8 });
    expect(new ChannelStreamModel(a).isBetterThan(b)).toBe(true);
  });

  it("lower response time wins", () => {
    const a = createStream({ healthStatus: "online", responseTime: 100 });
    const b = createStream({ healthStatus: "online", responseTime: 200 });
    expect(new ChannelStreamModel(a).isBetterThan(b)).toBe(true);
  });
});
