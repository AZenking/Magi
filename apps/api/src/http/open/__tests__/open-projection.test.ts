/**
 * Open API projection leak tests (T030, TDD).
 *
 * Guards the product-view contract (FR-012): channel responses MUST NOT
 * contain streamUrl, sourceId, healthStatus, lifecycle, primaryStreamId, etc.
 * And output-invisible channels MUST NOT appear (FR-011).
 *
 * Exercises the controller directly with fake use-cases (no HTTP server).
 */
import { describe, it, expect, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { OpenApiController } from "../open.controller";
import type { CanonicalChannel } from "@/domain/output-composition";

function makeChannel(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "ch-1",
    standardName: "CCTV-1",
    standardGroup: "央视",
    standardLogo: "https://logo/cctv1.png",
    channelNumber: 1,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: null,
    epgMatchType: null,
    epgStatus: null,
    outputStatus: "active",
    qualityScore: null,
    primaryStreamId: "stream-secret",
    mergedFromIds: null,
    mergeMethod: null,
    conflictNote: null,
    lastMergedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lifecycle: "active",
    lifecycleReason: "internal reason",
    trashedAt: null,
    purgeAfter: null,
    stableKey: null,
    version: 7,
    ...overrides,
  };
}

function makeController(channels: CanonicalChannel[], detailChannel?: CanonicalChannel) {
  return new OpenApiController(
    {
      execute: vi.fn(async () => ({ items: channels, total: channels.length })),
      findGroups: vi.fn(async () => [{ name: "央视", count: channels.length }]),
      countByLifecycle: vi.fn(async () => ({})),
    } as never,
    {
      execute: vi.fn(async () => ({
        channel: detailChannel ?? channels[0]!,
        streams: [],
      })),
    } as never,
    { execute: vi.fn(async () => ({ items: [], total: 0 })) } as never,
    { execute: vi.fn(async () => null) } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => ({ accepted: true })) } as never,
  );
}

/** Like makeController, but lets the caller control the reported `total`
 *  independently of `items.length` (for multi-page pagination tests). */
function makeControllerWithTotal(pageItems: CanonicalChannel[], total: number) {
  return new OpenApiController(
    {
      execute: vi.fn(async () => ({ items: pageItems, total })),
      findGroups: vi.fn(async () => []),
      countByLifecycle: vi.fn(async () => ({})),
    } as never,
    { execute: vi.fn(async () => ({ channel: pageItems[0]!, streams: [] })) } as never,
    { execute: vi.fn(async () => ({ items: [], total: 0 })) } as never,
    { execute: vi.fn(async () => null) } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => ({ accepted: true })) } as never,
  );
}

const FORBIDDEN_KEYS = [
  "streamUrl",
  "sourceId",
  "m3uSourceId",
  "healthStatus",
  "lifecycle",
  "lifecycleReason",
  "primaryStreamId",
  "epgStatus",
  "outputStatus",
  "trashedAt",
  "purgeAfter",
  "version",
];

describe("OpenApiController projection (FR-012, FR-011)", () => {
  it("channels response contains ONLY product-view fields", async () => {
    const controller = makeController([makeChannel()]);
    const res = await controller.channels({ page: 1, pageSize: 20 });
    const json = JSON.stringify(res.data!.items[0]);
    for (const key of FORBIDDEN_KEYS) {
      expect(json, `must not contain "${key}"`).not.toContain(`"${key}"`);
    }
    expect(res.data!.items[0]).toEqual({
      id: "magi:ch-1",
      name: "CCTV-1",
      group: "央视",
      logo: "https://logo/cctv1.png",
      channelNumber: 1,
    });
  });

  it("channel id is the stable magi:{id} form (FR-015)", async () => {
    const controller = makeController([makeChannel({ id: "abc-123" })]);
    const res = await controller.channels({ page: 1, pageSize: 20 });
    expect(res.data!.items[0]!.id).toBe("magi:abc-123");
  });

  it("hidden channel is EXCLUDED from the list (FR-011)", async () => {
    const controller = makeController([makeChannel({ lifecycle: "hidden" }), makeChannel({ id: "ch-2" })]);
    const res = await controller.channels({ page: 1, pageSize: 20 });
    expect(res.data!.items).toHaveLength(1);
    expect(res.data!.items[0]!.id).toBe("magi:ch-2");
  });

  it("disabled channel is EXCLUDED (FR-011)", async () => {
    const controller = makeController([makeChannel({ lifecycle: "disabled" })]);
    const res = await controller.channels({ page: 1, pageSize: 20 });
    expect(res.data!.items).toHaveLength(0);
  });

  it("trashed channel is EXCLUDED (FR-011)", async () => {
    const controller = makeController([makeChannel({ lifecycle: "trashed" })]);
    const res = await controller.channels({ page: 1, pageSize: 20 });
    expect(res.data!.items).toHaveLength(0);
  });

  it("multi-page: returns REAL total/totalPages when items < total (>100 channels)", async () => {
    // Simulate page 1 of a 250-channel catalog: 100 items on this page,
    // but the use case reports total=250. The controller must echo the real
    // total, not mapped.length (which would wrongly be 100 → totalPages=1).
    const pageItems = Array.from({ length: 100 }, (_, i) => makeChannel({ id: `ch-${i}` }));
    const controller = makeControllerWithTotal(pageItems, 250);
    const res = await controller.channels({ page: 1, pageSize: 100 });
    expect(res.data!.items).toHaveLength(100);
    expect(res.data!.total).toBe(250);         // real total, NOT items.length
    expect(res.data!.totalPages).toBe(3);      // ceil(250/100)
  });

  it("multi-page: page 2 of a 250-channel catalog still reports total=250", async () => {
    const pageItems = Array.from({ length: 50 }, (_, i) => makeChannel({ id: `ch-${100 + i}` }));
    const controller = makeControllerWithTotal(pageItems, 250);
    const res = await controller.channels({ page: 3, pageSize: 100 });
    expect(res.data!.items).toHaveLength(50);
    expect(res.data!.total).toBe(250);
    expect(res.data!.totalPages).toBe(3);
    expect(res.data!.page).toBe(3);
  });

  it("single-page: totalPages is at least 1 for empty result", async () => {
    const controller = makeControllerWithTotal([], 0);
    const res = await controller.channels({ page: 1, pageSize: 100 });
    expect(res.data!.total).toBe(0);
    expect(res.data!.totalPages).toBe(1);      // ceil(0/100) || 1
  });

  it("detail of a visible channel returns product view", async () => {
    const controller = makeController([], makeChannel({ id: "ch-9" }));
    const res = await controller.channelDetail({ id: "ch-9" });
    expect(res.data).toEqual({
      id: "magi:ch-9",
      name: "CCTV-1",
      group: "央视",
      logo: "https://logo/cctv1.png",
      channelNumber: 1,
    });
  });

  it("detail of a HIDDEN channel throws 404 (FR-011)", async () => {
    const controller = makeController([], makeChannel({ lifecycle: "hidden" }));
    await expect(controller.channelDetail({ id: "ch-1" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("detail accepts magi:{id} prefix and strips it", async () => {
    const controller = makeController([], makeChannel({ id: "ch-1" }));
    const res = await controller.channelDetail({ id: "magi:ch-1" });
    expect(res.data!.id).toBe("magi:ch-1");
  });

  it("groups response has only name + count", async () => {
    const controller = makeController([makeChannel()]);
    const res = await controller.groups();
    expect(res.data).toEqual([{ name: "央视", count: 1 }]);
  });
});
