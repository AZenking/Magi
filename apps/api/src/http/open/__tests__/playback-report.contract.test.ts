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
