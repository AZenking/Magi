import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { OpenApiController } from "../open.controller";
import { ContentSnapshotQuerySchema } from "@magi/types";

function makeSnapshotUseCase() {
  return {
    execute: vi.fn(async () => ({
      revision: { catalog: "12", epg: "34" },
      generatedAt: new Date("2026-07-31T06:00:00.000Z"),
      groups: [{ name: "央视", count: 1 }],
      channels: [
        {
          id: "magi:ch-1",
          name: "CCTV-1",
          group: "央视",
          logo: null,
          channelNumber: 1,
        },
      ],
      programmes: [],
    })),
  };
}

function makeResponse() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    setHeader: vi.fn(),
    status: vi.fn((status: number) => {
      state.status = status;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return response;
    }),
    send: vi.fn(),
  };
  return { response, httpResponse: response as unknown as Response, state };
}

function makeController(snapshot = makeSnapshotUseCase()) {
  return new OpenApiController(
    { execute: vi.fn(), findGroups: vi.fn(), countByLifecycle: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    snapshot as never,
    { execute: vi.fn(async () => ({ accepted: true })) } as never,
  );
}

describe("ContentSnapshotQuerySchema", () => {
  it("normalizes magi ids, removes duplicates, and caps guide windows", () => {
    const from = "2026-07-31T00:00:00.000Z";
    const to = "2026-08-01T00:00:00.000Z";
    const parsed = ContentSnapshotQuerySchema.safeParse({
      include: "guide",
      channelId: ["magi:ch-1", "ch-1"],
      from,
      to,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.channelIds).toEqual(["ch-1"]);
  });

  it("rejects more than three channels and windows over 24 hours", () => {
    const result = ContentSnapshotQuerySchema.safeParse({
      include: "guide",
      channelId: ["1", "2", "3", "4"],
      from: "2026-07-31T00:00:00.000Z",
      to: "2026-08-01T01:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("OpenApiController.contentSnapshot", () => {
  it("returns an ETag and responds 304 for an unchanged request", async () => {
    const controller = makeController();
    const first = makeResponse();
    await controller.contentSnapshot(
      { include: "catalog" },
      { headers: {} } as Request,
      first.httpResponse,
    );

    const etag = first.response.setHeader.mock.calls.find(([name]) => name === "ETag")?.[1];
    expect(first.state.status).toBe(200);
    expect(typeof etag).toBe("string");
    expect(first.state.body).toMatchObject({ success: true });

    const second = makeResponse();
    await controller.contentSnapshot(
      { include: "catalog" },
      { headers: { "if-none-match": etag } } as Request,
      second.httpResponse,
    );
    expect(second.state.status).toBe(304);
    expect(second.response.send).toHaveBeenCalledOnce();
  });
});
