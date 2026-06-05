import { describe, it, expect, vi } from "vitest";
import type { IChannelRepository, Channel, IRawXmltvChannelRepository, RawXmltvChannel } from "@/domain/channel-catalog";
import type { ICanonicalChannelRepository } from "@/domain/output-composition";

vi.mock("@/domain/epg-matching/epg-matcher", () => {
  class EpgMatcher {
    match(input: { channelTvgId: string | null; channelTvgName: string | null; channelDisplayName: string; manualEpgChannelId: string | null; xmltvChannels: Array<{ id: string; displayName: string }> }) {
      const ch = input.xmltvChannels.find(c => c.id === input.channelTvgId);
      if (ch) return { matched: true, xmltvChannelId: ch.id, matchType: "tvg-id", confidence: 1, candidates: [{ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "tvg-id", confidence: 1 }] };
      const byName = input.xmltvChannels.filter(c => c.displayName === input.channelDisplayName);
      if (byName.length > 1) return { matched: false, xmltvChannelId: null, matchType: "conflict", confidence: 0.9, candidates: [] };
      if (byName.length === 1) {
        const m = byName[0]!;
        return { matched: true, xmltvChannelId: m.id, matchType: "display-name", confidence: 0.9, candidates: [{ xmltvChannelId: m.id, xmltvDisplayName: m.displayName, matchType: "display-name", confidence: 0.9 }] };
      }
      return { matched: false, xmltvChannelId: null, matchType: null, confidence: 0, candidates: [] };
    }
  }
  return { EpgMatcher };
});

import { MatchEpgUseCase } from "../match-epg.use-case";

function createChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch-1",
    channelIdentity: "src-1::tvg-id::cctv1",
    m3uSourceId: "src-1",
    rawChannelId: "raw-1",
    displayName: "CCTV-1",
    groupTitle: "央视",
    tvgId: "cctv1",
    tvgLogo: null,
    streamUrl: "http://stream/1",
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

function createXmltvChannel(overrides: Partial<RawXmltvChannel> = {}): RawXmltvChannel {
  return {
    id: "xc-1",
    sourceId: "src-1",
    xmltvId: "cctv1",
    displayName: "CCTV-1",
    icon: "",
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepos(channels: Channel[], xmltvChannels: RawXmltvChannel[]) {
  const channelRepo: Partial<IChannelRepository> = {
    findAll: vi.fn(async () => ({ items: channels, total: channels.length })),
    update: vi.fn(async () => null),
  };
  const xmltvRepo: Partial<IRawXmltvChannelRepository> = {
    findBySourceId: vi.fn(async () => xmltvChannels),
  };
  const canonicalRepo: Partial<ICanonicalChannelRepository> = {
    deleteAll: vi.fn(async () => 0),
    createBatch: vi.fn(async () => []),
  };
  return { channelRepo, xmltvRepo, canonicalRepo };
}

describe("MatchEpgUseCase", () => {
  it("matches channels by tvg-id", async () => {
    const channels = [createChannel()];
    const xmltvChannels = [createXmltvChannel()];
    const { channelRepo, xmltvRepo, canonicalRepo } = makeRepos(channels, xmltvChannels);

    const useCase = new MatchEpgUseCase(
      channelRepo as IChannelRepository,
      xmltvRepo as IRawXmltvChannelRepository,
      canonicalRepo as ICanonicalChannelRepository,
    );

    const result = await useCase.execute("src-1");
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
  });

  it("reports unmatched when no match found", async () => {
    const channels = [createChannel({ tvgId: "unknown", displayName: "Unknown" })];
    const xmltvChannels = [createXmltvChannel({ xmltvId: "cctv1", displayName: "CCTV-1" })];
    const { channelRepo, xmltvRepo, canonicalRepo } = makeRepos(channels, xmltvChannels);

    const useCase = new MatchEpgUseCase(
      channelRepo as IChannelRepository,
      xmltvRepo as IRawXmltvChannelRepository,
      canonicalRepo as ICanonicalChannelRepository,
    );

    const result = await useCase.execute("src-1");
    expect(result.unmatched).toBe(1);
    expect(result.matched).toBe(0);
  });

  it("reports conflicts for ambiguous matches", async () => {
    const channels = [createChannel({ tvgId: null, displayName: "CCTV-1" })];
    const xmltvChannels = [
      createXmltvChannel({ xmltvId: "cctv1a", displayName: "CCTV-1" }),
      createXmltvChannel({ id: "xc-2", xmltvId: "cctv1b", displayName: "CCTV-1" }),
    ];
    const { channelRepo, xmltvRepo, canonicalRepo } = makeRepos(channels, xmltvChannels);

    const useCase = new MatchEpgUseCase(
      channelRepo as unknown as IChannelRepository,
      xmltvRepo as unknown as IRawXmltvChannelRepository,
      canonicalRepo as unknown as ICanonicalChannelRepository,
    );

    const result = await useCase.execute("src-1");
    expect(result.conflicts).toBeGreaterThanOrEqual(1);
  });
});
