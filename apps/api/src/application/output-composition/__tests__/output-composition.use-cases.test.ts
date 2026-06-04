import { describe, it, expect } from "vitest";
import type { ICanonicalChannelRepository, CanonicalChannel } from "@/domain/output-composition";
import type { IChannelStreamRepository, ChannelStream } from "@/domain/output-composition";
import { FindCanonicalChannelsUseCase } from "../find-canonical-channels.use-case";
import { GenerateM3uOutputUseCase } from "../generate-m3u-output.use-case";

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
    isPrimary: true,
    healthStatus: "online",
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

describe("FindCanonicalChannelsUseCase", () => {
  it("returns paginated channels", async () => {
    const channels = [createCanonical(), createCanonical({ id: "cc-2", standardName: "CCTV-2" })];
    const useCase = new FindCanonicalChannelsUseCase({
      findAll: async () => ({ items: channels, total: 2 }),
    } as unknown as ICanonicalChannelRepository);

    const result = await useCase.execute({ page: 1, pageSize: 20, hidden: false });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("returns empty when no channels", async () => {
    const useCase = new FindCanonicalChannelsUseCase({
      findAll: async () => ({ items: [], total: 0 }),
    } as unknown as ICanonicalChannelRepository);

    const result = await useCase.execute({ page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("GenerateM3uOutputUseCase", () => {
  it("generates valid M3U with channels and streams", async () => {
    const channels = [createCanonical()];
    const streams = [createStream()];

    const useCase = new GenerateM3uOutputUseCase(
      { findAll: async () => ({ items: channels, total: 1 }) } as unknown as ICanonicalChannelRepository,
      { findByCanonicalChannelId: async () => streams } as unknown as IChannelStreamRepository,
    );

    const output = await useCase.execute();
    expect(output).toContain("#EXTM3U");
    expect(output).toContain("#EXTINF:-1");
    expect(output).toContain('tvg-id="cctv1"');
    expect(output).toContain("CCTV-1");
    expect(output).toContain("http://stream.example.com/1");
  });

  it("skips hidden channels", async () => {
    const channels = [createCanonical({ hidden: true })];
    const useCase = new GenerateM3uOutputUseCase(
      { findAll: async () => ({ items: channels, total: 1 }) } as unknown as ICanonicalChannelRepository,
      { findByCanonicalChannelId: async () => [] } as unknown as IChannelStreamRepository,
    );

    const output = await useCase.execute();
    expect(output).toBe("#EXTM3U");
  });

  it("skips channels with no streams", async () => {
    const channels = [createCanonical()];
    const useCase = new GenerateM3uOutputUseCase(
      { findAll: async () => ({ items: channels, total: 1 }) } as unknown as ICanonicalChannelRepository,
      { findByCanonicalChannelId: async () => [] } as unknown as IChannelStreamRepository,
    );

    const output = await useCase.execute();
    expect(output).not.toContain("CCTV-1");
  });

  it("picks primary stream over others", async () => {
    const channels = [createCanonical()];
    const streams = [
      createStream({ isPrimary: false, streamUrl: "http://backup/1" }),
      createStream({ id: "cs-2", isPrimary: true, streamUrl: "http://primary/1" }),
    ];

    const useCase = new GenerateM3uOutputUseCase(
      { findAll: async () => ({ items: channels, total: 1 }) } as unknown as ICanonicalChannelRepository,
      { findByCanonicalChannelId: async () => streams } as unknown as IChannelStreamRepository,
    );

    const output = await useCase.execute();
    expect(output).toContain("http://primary/1");
    expect(output).not.toContain("http://backup/1");
  });
});
