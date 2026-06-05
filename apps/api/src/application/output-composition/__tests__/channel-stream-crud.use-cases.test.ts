import { describe, it, expect } from "vitest";
import type { ICanonicalChannelRepository, IChannelStreamRepository, CanonicalChannel, ChannelStream } from "@/domain/output-composition";
import type { IChannelRepository, Channel } from "@/domain/channel-catalog";
import { CreateChannelStreamUseCase, UpdateChannelStreamUseCase, DeleteChannelStreamUseCase, SetPrimaryStreamUseCase } from "../channel-stream-crud.use-cases";
import { NotFoundException } from "@nestjs/common";

function createCanonical(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "cc-1",
    standardName: "CCTV-1",
    standardGroup: "央视",
    standardLogo: null,
    channelNumber: null,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: null,
    epgMatchType: null,
    epgStatus: null,
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
    m3uSourceId: null,
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

function createRawChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch-1",
    channelIdentity: "cctv1",
    m3uSourceId: "src-1",
    rawChannelId: "raw-1",
    displayName: "CCTV-1",
    groupTitle: "央视",
    tvgId: "cctv1",
    tvgLogo: null,
    streamUrl: "http://stream.example.com/raw1",
    epgChannelId: null,
    epgMatchType: null,
    active: true,
    streamStatus: null,
    streamResponseTime: null,
    streamCheckedAt: null,
    streamError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockRepos(opts: {
  canonical?: Partial<ICanonicalChannelRepository>;
  stream?: Partial<IChannelStreamRepository>;
  channel?: Partial<IChannelRepository>;
} = {}) {
  return {
    canonicalRepo: opts.canonical as ICanonicalChannelRepository,
    streamRepo: opts.stream as IChannelStreamRepository,
    channelRepo: opts.channel as IChannelRepository,
  };
}

describe("CreateChannelStreamUseCase", () => {
  it("creates first stream as primary and syncs canonical.primaryStreamId", async () => {
    const canonical = createCanonical();
    const createdStream = createStream({ id: "cs-new", isPrimary: true });
    let updatedPrimaryId: string | null = null;

    const { canonicalRepo, streamRepo, channelRepo } = makeMockRepos({
      canonical: {
        findById: async () => canonical,
        update: async (_id: string, data: Partial<CanonicalChannel>) => {
          updatedPrimaryId = data.primaryStreamId ?? null;
          return { ...canonical, ...data };
        },
      },
      stream: {
        findByCanonicalChannelId: async () => [],
        create: async (data) => ({ ...createdStream, ...data, id: "cs-new" } as ChannelStream),
      },
      channel: { findById: async () => null },
    });

    const useCase = new CreateChannelStreamUseCase(streamRepo, canonicalRepo, channelRepo);
    const result = await useCase.execute("cc-1", { streamUrl: "http://example.com/stream" });

    expect(result.isPrimary).toBe(true);
    expect(updatedPrimaryId).toBe("cs-new");
  });

  it("creates second stream as non-primary without updating canonical", async () => {
    const canonical = createCanonical({ primaryStreamId: "cs-1" });
    const existing = createStream({ id: "cs-1", isPrimary: true });
    let updateCalled = false;

    const { canonicalRepo, streamRepo, channelRepo } = makeMockRepos({
      canonical: {
        findById: async () => canonical,
        update: async () => { updateCalled = true; return canonical; },
      },
      stream: {
        findByCanonicalChannelId: async () => [existing],
        create: async (data) => createStream({ id: "cs-2", ...data }),
      },
      channel: { findById: async () => null },
    });

    const useCase = new CreateChannelStreamUseCase(streamRepo, canonicalRepo, channelRepo);
    const result = await useCase.execute("cc-1", { streamUrl: "http://example.com/stream2" });

    expect(result.isPrimary).toBe(false);
    expect(updateCalled).toBe(false);
  });

  it("pulls data from source channel when sourceChannelId provided", async () => {
    const canonical = createCanonical();
    const rawChannel = createRawChannel();
    let createdData: Record<string, unknown> | null = null;

    const { canonicalRepo, streamRepo, channelRepo } = makeMockRepos({
      canonical: {
        findById: async () => canonical,
        update: async () => canonical,
      },
      stream: {
        findByCanonicalChannelId: async () => [],
        create: async (data) => {
          createdData = data as Record<string, unknown>;
          return createStream({ id: "cs-new", ...data });
        },
      },
      channel: { findById: async () => rawChannel },
    });

    const useCase = new CreateChannelStreamUseCase(streamRepo, canonicalRepo, channelRepo);
    await useCase.execute("cc-1", {
      streamUrl: "http://override.com/stream",
      sourceChannelId: "ch-1",
    });

    expect(createdData).not.toBeNull();
    expect(createdData!.streamUrl).toBe("http://stream.example.com/raw1"); // raw channel url wins
    expect(createdData!.m3uSourceId).toBe("src-1");
    expect(createdData!.rawChannelId).toBe("raw-1"); // FK to raw_m3u_channels, not channels.id
    expect(createdData!.sourceChannelId).toBe("ch-1");
  });

  it("throws when canonical not found", async () => {
    const { canonicalRepo, streamRepo, channelRepo } = makeMockRepos({
      canonical: { findById: async () => null },
      stream: { findByCanonicalChannelId: async () => [] },
      channel: { findById: async () => null },
    });

    const useCase = new CreateChannelStreamUseCase(streamRepo, canonicalRepo, channelRepo);
    await expect(useCase.execute("bad-id", { streamUrl: "http://x.com" }))
      .rejects.toThrow(NotFoundException);
  });

  it("throws when sourceChannelId references non-existent channel", async () => {
    const { canonicalRepo, streamRepo, channelRepo } = makeMockRepos({
      canonical: { findById: async () => createCanonical() },
      stream: { findByCanonicalChannelId: async () => [] },
      channel: { findById: async () => null },
    });

    const useCase = new CreateChannelStreamUseCase(streamRepo, canonicalRepo, channelRepo);
    await expect(useCase.execute("cc-1", { streamUrl: "http://x.com", sourceChannelId: "bad" }))
      .rejects.toThrow(NotFoundException);
  });
});

describe("SetPrimaryStreamUseCase", () => {
  it("sets a stream as primary and clears others", async () => {
    const s1 = createStream({ id: "cs-1", isPrimary: true });
    const s2 = createStream({ id: "cs-2", isPrimary: false });
    let primaryStreamId: string | null = null;
    const demotedIds: string[] = [];

    const { canonicalRepo, streamRepo } = makeMockRepos({
      canonical: {
        update: async (_id: string, data: Partial<CanonicalChannel>) => {
          primaryStreamId = data.primaryStreamId ?? null;
          return createCanonical();
        },
      },
      stream: {
        findById: async () => s2,
        findByCanonicalChannelId: async () => [s1, s2],
        update: async (id: string, data: Partial<ChannelStream>) => {
          if (data.isPrimary === false) demotedIds.push(id);
          return { ...(id === "cs-1" ? s1 : s2), ...data } as ChannelStream;
        },
      },
    });

    const useCase = new SetPrimaryStreamUseCase(streamRepo, canonicalRepo);
    await useCase.execute("cs-2");

    expect(demotedIds).toContain("cs-1");
    expect(primaryStreamId).toBe("cs-2");
  });
});

describe("DeleteChannelStreamUseCase", () => {
  it("auto-promotes remaining stream when deleting primary", async () => {
    const primary = createStream({ id: "cs-1", isPrimary: true });
    const secondary = createStream({ id: "cs-2", isPrimary: false });
    let promotedId: string | null = null;
    let updatedPrimaryId: string | null = null;

    const { canonicalRepo, streamRepo } = makeMockRepos({
      canonical: {
        update: async (_id: string, data: Partial<CanonicalChannel>) => {
          updatedPrimaryId = data.primaryStreamId ?? null;
          return createCanonical();
        },
      },
      stream: {
        findById: async () => primary,
        deleteById: async () => true,
        findByCanonicalChannelId: async () => [secondary],
        update: async (id: string, data: Partial<ChannelStream>) => {
          if (data.isPrimary) promotedId = id;
          return { ...secondary, ...data } as ChannelStream;
        },
      },
    });

    const useCase = new DeleteChannelStreamUseCase(streamRepo, canonicalRepo);
    await useCase.execute("cs-1");

    expect(promotedId).toBe("cs-2");
    expect(updatedPrimaryId).toBe("cs-2");
  });

  it("clears primaryStreamId when deleting last stream", async () => {
    const primary = createStream({ id: "cs-1", isPrimary: true });
    let capturedData: Partial<CanonicalChannel> | null = null;

    const { canonicalRepo, streamRepo } = makeMockRepos({
      canonical: {
        update: async (_id: string, data: Partial<CanonicalChannel>) => {
          capturedData = data;
          return createCanonical();
        },
      },
      stream: {
        findById: async () => primary,
        deleteById: async () => true,
        findByCanonicalChannelId: async () => [],
      },
    });

    const useCase = new DeleteChannelStreamUseCase(streamRepo, canonicalRepo);
    await useCase.execute("cs-1");

    expect(capturedData).not.toBeNull();
    expect(capturedData!.primaryStreamId).toBeNull();
  });

  it("does not touch primary when deleting non-primary stream", async () => {
    const nonPrimary = createStream({ id: "cs-2", isPrimary: false });
    let canonicalUpdateCalled = false;

    const { canonicalRepo, streamRepo } = makeMockRepos({
      canonical: {
        update: async () => { canonicalUpdateCalled = true; return createCanonical(); },
      },
      stream: {
        findById: async () => nonPrimary,
        deleteById: async () => true,
        findByCanonicalChannelId: async () => [],
      },
    });

    const useCase = new DeleteChannelStreamUseCase(streamRepo, canonicalRepo);
    await useCase.execute("cs-2");

    expect(canonicalUpdateCalled).toBe(false);
  });

  it("throws when stream not found", async () => {
    const { canonicalRepo, streamRepo } = makeMockRepos({
      canonical: {},
      stream: { findById: async () => null },
    });

    const useCase = new DeleteChannelStreamUseCase(streamRepo, canonicalRepo);
    await expect(useCase.execute("bad")).rejects.toThrow(NotFoundException);
  });
});

describe("UpdateChannelStreamUseCase", () => {
  it("updates stream URL", async () => {
    const stream = createStream({ id: "cs-1", streamUrl: "http://old.com" });

    const { streamRepo } = makeMockRepos({
      stream: {
        findById: async () => stream,
        update: async (_id: string, data: Partial<ChannelStream>) =>
          ({ ...stream, ...data }) as ChannelStream,
      },
    });

    const useCase = new UpdateChannelStreamUseCase(streamRepo);
    const result = await useCase.execute("cs-1", { streamUrl: "http://new.com" });

    expect(result.streamUrl).toBe("http://new.com");
  });

  it("throws when stream not found", async () => {
    const { streamRepo } = makeMockRepos({
      stream: { findById: async () => null },
    });

    const useCase = new UpdateChannelStreamUseCase(streamRepo);
    await expect(useCase.execute("bad", { streamUrl: "http://x.com" }))
      .rejects.toThrow(NotFoundException);
  });
});
