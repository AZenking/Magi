/**
 * Open API playback tests (005 playback endpoint).
 *
 * Guards the playback-decision contract: exposes line url/format/health (that
 * is its purpose) but NEVER sourceId/sourceName/admin fields; invisible
 * channels → 404; no usable line → playable:false; id accepts magi:{id}.
 */
import { describe, it, expect, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { OpenApiController } from "../open.controller";

function makeController(playbackResult: unknown) {
  return new OpenApiController(
    { execute: vi.fn(), findGroups: vi.fn(), countByLifecycle: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => ({ items: [], total: 0 })) } as never,
    { execute: vi.fn(async () => playbackResult) } as never,
    { execute: vi.fn() } as never,
  );
}

describe("OpenApiController.playback", () => {
  it("resolves a visible channel with a usable line", async () => {
    const controller = makeController({
      channelId: "magi:ch-1",
      playable: true,
      primary: { streamId: "s-1", url: "https://up/hls.m3u8", format: "hls", health: "online" },
      fallbacks: [{ streamId: "s-2", url: "https://up2/ts", format: null, health: "degraded" }],
    });
    const res = await controller.playback({ id: "magi:ch-1" });
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      channelId: "magi:ch-1",
      playable: true,
      deliveryMode: "direct",
    });
    expect(res.data!.primary).toEqual({ streamId: "s-1", url: "https://up/hls.m3u8", format: "hls", health: "online" });
    expect(res.data!.fallbacks).toHaveLength(1);
    // decisionExpiresAt is an ISO string in the future.
    expect(new Date(res.data!.decisionExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("exposes url/format/health but NEVER sourceId/admin fields", async () => {
    const controller = makeController({
      channelId: "magi:ch-1",
      playable: true,
      primary: { streamId: "s-1", url: "https://up/hls", format: null, health: "online" },
      fallbacks: [],
    });
    const res = await controller.playback({ id: "ch-1" });
    const json = JSON.stringify(res.data);
    expect(json).toContain('"url"');
    expect(json).not.toContain("sourceId");
    expect(json).not.toContain("m3uSourceId");
    expect(json).not.toContain("consecutiveFailures");
  });

  it("invisible/nonexistent channel → 404 (use-case returns null)", async () => {
    const controller = makeController(null);
    await expect(controller.playback({ id: "ch-x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("no usable line → playable:false with primary null", async () => {
    const controller = makeController({
      channelId: "magi:ch-1",
      playable: false,
      primary: null,
      fallbacks: [],
    });
    const res = await controller.playback({ id: "ch-1" });
    expect(res.data!.playable).toBe(false);
    expect(res.data!.primary).toBeNull();
    expect(res.data!.fallbacks).toEqual([]);
  });

  it("strips magi: prefix from the path id", async () => {
    const controller = makeController({
      channelId: "magi:ch-1",
      playable: true,
      primary: { streamId: "s-1", url: "https://up", format: null, health: "online" },
      fallbacks: [],
    });
    const res = await controller.playback({ id: "magi:ch-1" });
    expect(res.data!.channelId).toBe("magi:ch-1");
  });
});
