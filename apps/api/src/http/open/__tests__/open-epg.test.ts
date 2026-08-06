/**
 * Open API EPG tests (T036, TDD).
 *
 * Guards the EPG contract (FR-013/FR-014): valid window returns programmes;
 * >7-day window and from>=to are rejected (400); hidden-channel programmes are
 * excluded (FR-011/US3-AC3).
 *
 * The schema-level window cap is exercised via OpenEpgQuerySchema.safeParse.
 */
import { describe, it, expect, vi } from "vitest";
import { OpenApiController } from "../open.controller";
import { OpenEpgQuerySchema } from "@magi/types";
import type { CanonicalChannel } from "@/domain/output-composition";
import type { Programme } from "@/domain/channel-catalog";

function makeChannel(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "ch-1",
    standardName: "CCTV-1",
    standardGroup: "央视",
    standardLogo: null,
    channelNumber: 1,
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
    lifecycle: "active",
    lifecycleReason: null,
    trashedAt: null,
    purgeAfter: null,
    stableKey: null,
    version: 1,
    ...overrides,
  };
}

function makeProgramme(overrides: Partial<Programme> = {}): Programme {
  return {
    id: "p-1",
    sourceId: "src-1",
    xmltvChannelId: "xmltv-1",
    title: "新闻联播",
    subTitle: null,
    desc: null,
    category: "新闻",
    startAt: new Date("2026-07-29T19:00:00Z"),
    stopAt: new Date("2026-07-29T19:30:00Z"),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeController(items: { channel: CanonicalChannel; programmes: Programme[] }[]) {
  return new OpenApiController(
    { execute: vi.fn(), findGroups: vi.fn(), countByLifecycle: vi.fn() } as never,
    { execute: vi.fn() } as never,
    {
      execute: vi.fn(async () => ({ items, total: items.length })),
    } as never,
    { execute: vi.fn(async () => null) } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => ({ accepted: true })) } as never,
  );
}

const DAY = 24 * 60 * 60 * 1000;

describe("OpenEpgQuerySchema validation (FR-014)", () => {
  it("valid 1-hour window parses", () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(OpenEpgQuerySchema.safeParse({ from, to, page: 1, pageSize: 100 }).success).toBe(true);
  });

  it("window > 7 days is REJECTED", () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 8 * DAY).toISOString();
    expect(OpenEpgQuerySchema.safeParse({ from, to, page: 1, pageSize: 100 }).success).toBe(false);
  });

  it("from >= to is REJECTED", () => {
    const t = new Date().toISOString();
    expect(OpenEpgQuerySchema.safeParse({ from: t, to: t, page: 1, pageSize: 100 }).success).toBe(false);
  });

  it("exactly 7 days is ACCEPTED (boundary)", () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * DAY).toISOString();
    expect(OpenEpgQuerySchema.safeParse({ from, to, page: 1, pageSize: 100 }).success).toBe(true);
  });
});

describe("OpenApiController.epg projection", () => {
  it("returns programmes for visible channels with magi:{id} mapping", async () => {
    const controller = makeController([
      { channel: makeChannel({ id: "ch-1" }), programmes: [makeProgramme()] },
    ]);
    const from = new Date();
    const to = new Date(Date.now() + 60 * 60 * 1000);
    const res = await controller.epg({
      from: from.toISOString(),
      to: to.toISOString(),
      page: 1,
      pageSize: 100,
    });
    expect(res.data!.items).toHaveLength(1);
    expect(res.data!.items[0]).toEqual({
      channelId: "magi:ch-1",
      title: "新闻联播",
      subTitle: null,
      startAt: "2026-07-29T19:00:00.000Z",
      stopAt: "2026-07-29T19:30:00.000Z",
      category: "新闻",
    });
  });

  it("EXCLUDES programmes of hidden channels (FR-011)", async () => {
    const controller = makeController([
      { channel: makeChannel({ id: "ch-1", lifecycle: "hidden" }), programmes: [makeProgramme()] },
      { channel: makeChannel({ id: "ch-2" }), programmes: [makeProgramme({ id: "p-2" })] },
    ]);
    const from = new Date();
    const to = new Date(Date.now() + 60 * 60 * 1000);
    const res = await controller.epg({
      from: from.toISOString(),
      to: to.toISOString(),
      page: 1,
      pageSize: 100,
    });
    expect(res.data!.items).toHaveLength(1);
    expect(res.data!.items[0]!.channelId).toBe("magi:ch-2");
  });
});
