import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DeviceHeartbeatController } from "../device-heartbeat.controller";

const deviceRequest = {
  principal: {
    kind: "device" as const,
    oauthClientId: "oauth-1",
    clientId: "magi_tv",
    clientName: "Magi TV",
    deviceClientId: "device-1",
    ownerUserId: "user-1",
    scope: "client:heartbeat",
  },
};

describe("device heartbeat HTTP contract", () => {
  it("returns server cadence metadata for a device principal", async () => {
    const controller = new DeviceHeartbeatController({
      execute: vi.fn(async () => ({
        serverTime: new Date("2026-07-31T00:00:00.000Z"),
        lastActiveAt: new Date("2026-07-31T00:00:00.000Z"),
      })),
    } as never);
    const response = await controller.record(
      { app_version: "1.0.0", platform_version: "Android 14" },
      deviceRequest,
    );
    expect(response.data).toMatchObject({
      next_heartbeat_in_seconds: 60,
      online_window_seconds: 150,
    });
  });

  it("rejects malformed bodies and integration principals", async () => {
    const controller = new DeviceHeartbeatController({ execute: vi.fn() } as never);
    await expect(controller.record({}, deviceRequest)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.record(
      { app_version: "1.0.0", platform_version: "Android 14" },
      { principal: { kind: "integration", scope: "open:read" } } as never,
    )).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.record(
      { app_version: "1.0.0", platform_version: "Android 14" },
      { principal: { ...deviceRequest.principal, scope: "open:read" } } as never,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});
