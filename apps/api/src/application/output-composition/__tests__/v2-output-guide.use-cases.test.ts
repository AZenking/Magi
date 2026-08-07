import { describe, expect, it, vi } from "vitest";
import {
  GenerateM3uV2OutputUseCase,
  GenerateXmltvV2OutputUseCase,
} from "../generate-v2-output.use-cases";
import { FindOutputGuideUseCase } from "../output-guide.use-case";
import { UpdateManualEpgBindingUseCase } from "../update-manual-epg-binding.use-case";

const now = new Date("2026-07-28T00:00:00.000Z");

function channel(id: string, lifecycle = "active") {
  return {
    id,
    standardName: `Channel & ${id}`,
    standardGroup: "News",
    standardLogo: null,
    channelNumber: null,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: "shared",
    epgMatchType: "auto",
    epgStatus: "matched_auto",
    outputStatus: "active",
    qualityScore: null,
    primaryStreamId: null,
    mergedFromIds: null,
    mergeMethod: null,
    conflictNote: null,
    lastMergedAt: null,
    createdAt: now,
    updatedAt: now,
    lifecycle,
    version: 1,
  };
}

function binding(channelId: string, sourceId: string) {
  return {
    canonicalChannelId: channelId,
    xmltvSourceId: sourceId,
    xmltvChannelId: "shared",
    status: "matched_auto",
    matchType: "auto",
    locked: false,
    decisionReason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    xmltvSourceName: sourceId,
    sourceEnabled: true,
    sourceLastSyncAt: now,
    sourceFreshnessThresholdMinutes: 1440,
  };
}

function programme(id: string, sourceId: string, startAt = now) {
  return {
    id,
    sourceId,
    xmltvChannelId: "shared",
    title: `News & ${sourceId}`,
    subTitle: null,
    desc: null,
    category: null,
    startAt,
    stopAt: new Date(startAt.getTime() + 30 * 60_000),
    createdAt: now,
  };
}

describe("V2 output", () => {
  it("uses one stable Magi id in M3U and excludes inactive channels", async () => {
    const canonicalRepo = {
      findAll: vi.fn().mockResolvedValue({
        items: [channel("active"), channel("hidden", "hidden")],
        total: 2,
      }),
    };
    const streamRepo = {
      findByCanonicalChannelIdWithSource: vi.fn().mockResolvedValue([
        {
          streamUrl: "https://stream.example/live",
          healthStatus: "online",
          isPrimary: true,
          eligibleForFailover: true,
          sourceParticipateInOutput: true,
          responseTime: 10,
        },
      ]),
    };
    const output = await new GenerateM3uV2OutputUseCase(
      canonicalRepo as never,
      streamRepo as never,
    ).execute();

    expect(output).toContain('tvg-id="magi:active"');
    expect(output).not.toContain("magi:hidden");
  });

  it("keeps programmes source-qualified and rewrites XMLTV channel ids", async () => {
    const channels = [channel("one"), channel("two")];
    const bindings = new Map([
      ["one", binding("one", "source-a")],
      ["two", binding("two", "source-b")],
    ]);
    const programmeRepo = {
      findBySourceChannelAndRange: vi
        .fn()
        .mockResolvedValue([
          programme("p-a", "source-a"),
          programme("p-b", "source-b"),
        ]),
    };
    const output = await new GenerateXmltvV2OutputUseCase(
      { findAll: async () => ({ items: channels, total: 2 }) } as never,
      { findByCanonicalChannelIds: async () => bindings } as never,
      programmeRepo as never,
    ).execute();

    expect(programmeRepo.findBySourceChannelAndRange).toHaveBeenCalledWith([
      { sourceId: "source-a", xmltvChannelId: "shared" },
      { sourceId: "source-b", xmltvChannelId: "shared" },
    ]);
    expect(output).toContain('<channel id="magi:one">');
    expect(output).toContain('channel="magi:one"');
    expect(output).toContain('channel="magi:two"');
    expect(output).toContain("20260728000000 +0000");
    expect(output).toContain("News &amp; source-a");
  });
});

describe("FindOutputGuideUseCase", () => {
  it("filters final projections by overlap anomaly", async () => {
    const first = programme("p1", "source-a");
    const second = programme(
      "p2",
      "source-a",
      new Date(first.stopAt.getTime() - 5 * 60_000),
    );
    const useCase = new FindOutputGuideUseCase(
      {
        findAll: async () => ({ items: [channel("one")], total: 1 }),
      } as never,
      {
        findByCanonicalChannelIds: async () =>
          new Map([["one", binding("one", "source-a")]]),
      } as never,
      {
        findBySourceChannelAndRange: async () => [first, second],
      } as never,
    );

    const result = await useCase.execute({
      from: now,
      to: new Date(now.getTime() + 24 * 60 * 60_000),
      status: "overlap",
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.anomalies).toContain("overlap");
  });
});

describe("UpdateManualEpgBindingUseCase", () => {
  it("persists the selected XMLTV source and mirrors legacy fields", async () => {
    const upsert = vi.fn().mockResolvedValue(binding("one", "source-a"));
    const update = vi.fn().mockResolvedValue(channel("one"));
    const useCase = new UpdateManualEpgBindingUseCase(
      {
        upsert,
      } as never,
      {
        findById: async () => channel("one"),
        update,
      } as never,
      {
        findBySourceAndXmltvId: vi
          .fn()
          .mockResolvedValue({ sourceId: "source-a", xmltvId: "shared" }),
      } as never,
    );

    await useCase.execute({
      channelId: "one",
      xmltvSourceId: "source-a",
      epgChannelId: "shared",
      locked: true,
      reason: "operator selected",
      expectedVersion: 3,
    });

    expect(upsert).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({
        xmltvSourceId: "source-a",
        xmltvChannelId: "shared",
        status: "matched_manual",
        locked: true,
      }),
      3,
    );
    expect(update).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({
        epgChannelId: "shared",
        epgStatus: "matched_manual",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane T036 — shared line-selection ordering.
//
// Both M3U output (v1 + v2) and Open playback must derive the line order
// from the same pure helper: missing streams sink, then health, then
// successRate, then position, then responseTime. The contract below pins
// the helper's signature so all three call sites stay aligned.
// ---------------------------------------------------------------------------

describe("Shared line-selection ordering (T036, 009)", () => {
  it("exports a pure selectPlaybackLine helper from backend-core", async () => {
    const mod = await import("@magi/backend-core");
    expect(typeof mod.selectPlaybackLine).toBe("function");
  });

  it("returns null on an empty stream set", async () => {
    const { selectPlaybackLine } = await import("@magi/backend-core");
    expect(selectPlaybackLine([])).toBeNull();
  });

  it("prefers a healthy stream over a missing one", async () => {
    const { selectPlaybackLine } = await import("@magi/backend-core");
    const online = {
      id: "a",
      isPrimary: true,
      position: 0,
      eligibleForFailover: true,
      healthStatus: "online" as const,
      responseTime: 100,
      successRate: 99,
      consecutiveFailures: 0,
      origin: "source" as const,
      missingSince: null,
    };
    const missing = {
      ...online,
      id: "b",
      isPrimary: false,
      missingSince: new Date(),
    };
    expect(selectPlaybackLine([missing, online])?.id).toBe("a");
  });

  it("prefers primary stream when both are equally healthy", async () => {
    const { selectPlaybackLine } = await import("@magi/backend-core");
    const primary = {
      id: "p",
      isPrimary: true,
      position: 0,
      eligibleForFailover: true,
      healthStatus: "online" as const,
      responseTime: 100,
      successRate: 99,
      consecutiveFailures: 0,
      origin: "source" as const,
      missingSince: null,
    };
    const backup = { ...primary, id: "b", isPrimary: false, position: 1 };
    expect(selectPlaybackLine([backup, primary])?.id).toBe("p");
  });

  it("manual streams survive even when source streams are missing", async () => {
    const { selectPlaybackLine } = await import("@magi/backend-core");
    const manual = {
      id: "m",
      isPrimary: false,
      position: 5,
      eligibleForFailover: true,
      healthStatus: "online" as const,
      responseTime: 200,
      successRate: 80,
      consecutiveFailures: 0,
      origin: "manual" as const,
      missingSince: null,
    };
    const sourceMissing = {
      id: "s",
      isPrimary: true,
      position: 0,
      eligibleForFailover: true,
      healthStatus: "online" as const,
      responseTime: 100,
      successRate: 99,
      consecutiveFailures: 0,
      origin: "source" as const,
      missingSince: new Date(),
    };
    expect(selectPlaybackLine([sourceMissing, manual])?.id).toBe("m");
  });
});
