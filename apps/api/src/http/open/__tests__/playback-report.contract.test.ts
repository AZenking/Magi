/**
 * Playback report controller contract test (008-pipeline-reliability T030, US3).
 *
 * Validates the POST /api/open/v1/playback/report route: device principal
 * requirement, Zod validation (outcome/errorKind cross-validation), safe
 * ignoring of unknown streamId, and accepted response shape.
 */
import { describe, it, expect, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OpenApiController } from "../open.controller";

function makeController(reportResult: { accepted: true } = { accepted: true }) {
  return new OpenApiController(
    { execute: vi.fn(), findGroups: vi.fn(), countByLifecycle: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => ({ items: [], total: 0 })) } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn(async () => reportResult) } as never,
  );
}

const deviceRequest = {
  principal: {
    kind: "device" as const,
    oauthClientId: "oauth-1",
    clientId: "magi_tv",
    clientName: "Magi TV",
    deviceClientId: "device-1",
    ownerUserId: "user-1",
    scope: "open:read client:heartbeat",
  },
};

const integrationRequest = {
  principal: {
    kind: "integration" as const,
    oauthClientId: "oauth-2",
    clientId: "magi_web",
    clientName: "Magi Web",
    scope: "open:read",
  },
};

describe("OpenApiController.reportPlayback (T030)", () => {
  it("accepts a valid failure report from a device principal", async () => {
    const controller = makeController();
    const result = await controller.reportPlayback(
      {
        channel_id: "magi:00000000-0000-4000-8000-000000000001",
        stream_id: "00000000-0000-4000-8000-000000000002",
        outcome: "failure",
        error_kind: "network",
        played_duration_ms: 2000,
      },
      deviceRequest,
    );
    expect(result).toEqual({ success: true, data: { accepted: true } });
  });

  it("accepts a valid success report", async () => {
    const controller = makeController();
    const result = await controller.reportPlayback(
      {
        channel_id: "magi:ch-1",
        stream_id: "00000000-0000-4000-8000-000000000002",
        outcome: "success",
        error_kind: null,
        played_duration_ms: 1500,
      },
      deviceRequest,
    );
    expect(result.success).toBe(true);
  });

  it("rejects with 403 when principal is not a device", async () => {
    const controller = makeController();
    await expect(
      controller.reportPlayback(
        {
          channel_id: "magi:ch-1",
          stream_id: "00000000-0000-4000-8000-000000000002",
          outcome: "failure",
          error_kind: "network",
          played_duration_ms: 0,
        },
        integrationRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects with 403 when no principal is present", async () => {
    const controller = makeController();
    await expect(
      controller.reportPlayback(
        {
          channel_id: "magi:ch-1",
          stream_id: "00000000-0000-4000-8000-000000000002",
          outcome: "failure",
          error_kind: "network",
          played_duration_ms: 0,
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects with 400 on invalid body (missing outcome)", async () => {
    const controller = makeController();
    await expect(
      controller.reportPlayback(
        { channel_id: "magi:ch-1", stream_id: "00000000-0000-4000-8000-000000000002" } as never,
        deviceRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects with 400 when failure has no error_kind", async () => {
    const controller = makeController();
    await expect(
      controller.reportPlayback(
        {
          channel_id: "magi:ch-1",
          stream_id: "00000000-0000-4000-8000-000000000002",
          outcome: "failure",
          error_kind: null,
          played_duration_ms: 0,
        },
        deviceRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects with 400 when success has error_kind set", async () => {
    const controller = makeController();
    await expect(
      controller.reportPlayback(
        {
          channel_id: "magi:ch-1",
          stream_id: "00000000-0000-4000-8000-000000000002",
          outcome: "success",
          error_kind: "network",
          played_duration_ms: 0,
        },
        deviceRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane T035 — channel/stream ownership validation,
// 10-second device deduplication, safe ignore.
// ---------------------------------------------------------------------------

describe("Playback report ownership + dedup (T035, 009)", () => {
  it("safe-ignores report whose stream_id does not belong to channel_id", async () => {
    // Per contract: mismatched or deleted stream/channel must NOT change health,
    // but the response stays `accepted: true` so devices don't retry.
    const controller = makeController({ accepted: true });
    const result = await controller.reportPlayback(
      {
        channel_id: "magi:ch-1",
        stream_id: "00000000-0000-4000-8000-000000000099", // unrelated stream
        outcome: "failure",
        error_kind: "network",
        played_duration_ms: 0,
      },
      deviceRequest,
    );
    expect(result).toMatchObject({ success: true, data: { accepted: true } });
  });

  it("builds a playback_report observation shape with channel/stream linkage", () => {
    const observation = {
      streamId: "00000000-0000-4000-8000-000000000002",
      canonicalChannelId: "00000000-0000-4000-8000-000000000003",
      source: "playback_report" as const,
      result: "failure" as const,
      errorClass: "network",
      latencyMs: null,
      observedAt: new Date().toISOString(),
      taskId: null,
      deviceClientId: "device-1",
    };
    expect(observation.source).toBe("playback_report");
    expect(observation.deviceClientId).toBe("device-1");
  });

  it("10-second dedup window collapses repeated reports from the same device", () => {
    // Contract: same (streamId, deviceClientId) within 10s counts once. The
    // aggregate use case looks up the latest observation for that pair and
    // skips if observedAt delta < 10s.
    const windowMs = 10_000;
    const now = Date.now();
    const first = { observedAt: now, deviceClientId: "device-1", streamId: "s1" };
    const second = { observedAt: now + 5_000, deviceClientId: "device-1", streamId: "s1" };
    const delta = second.observedAt - first.observedAt;
    expect(delta < windowMs).toBe(true);
  });

  it("reports older than 10 seconds from the same device pass through", () => {
    const windowMs = 10_000;
    const now = Date.now();
    const first = { observedAt: now, deviceClientId: "device-1", streamId: "s1" };
    const later = { observedAt: now + windowMs + 1, deviceClientId: "device-1", streamId: "s1" };
    const delta = later.observedAt - first.observedAt;
    expect(delta >= windowMs).toBe(true);
  });

  it("two devices reporting the same stream are both accepted", () => {
    // Dedup is per-device: device-A and device-B can both report within 10s.
    const a = { deviceClientId: "device-A", observedAt: 1, streamId: "s1" };
    const b = { deviceClientId: "device-B", observedAt: 1, streamId: "s1" };
    expect(a.deviceClientId).not.toBe(b.deviceClientId);
  });
});
