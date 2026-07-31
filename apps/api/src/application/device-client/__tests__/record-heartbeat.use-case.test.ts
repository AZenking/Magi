import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RecordHeartbeatUseCase } from "../record-heartbeat.use-case";

function repository(result: unknown) {
  return { recordHeartbeat: vi.fn(async () => result) } as never;
}

describe("RecordHeartbeatUseCase", () => {
  it("requires a device principal", async () => {
    const useCase = new RecordHeartbeatUseCase(repository({ kind: "updated" }));
    await expect(
      useCase.execute({ appVersion: "1.0.0", platformVersion: "Android 14" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns server-derived cadence metadata", async () => {
    const lastHeartbeatAt = new Date("2026-01-01T00:00:00.000Z");
    const repo = repository({ kind: "updated", lastHeartbeatAt });
    const useCase = new RecordHeartbeatUseCase(repo);
    const result = await useCase.execute({
      deviceClientId: "device-1",
      appVersion: "1.0.0",
      platformVersion: "Android 14",
    });
    expect(result.lastActiveAt).toBe(lastHeartbeatAt);
    expect(result.nextHeartbeatInSeconds).toBe(60);
    expect(result.onlineWindowSeconds).toBe(150);
  });

  it("turns a revoked update into an unauthorized response", async () => {
    const useCase = new RecordHeartbeatUseCase(repository({ kind: "revoked" }));
    await expect(
      useCase.execute({
        deviceClientId: "device-1",
        appVersion: "1.0.0",
        platformVersion: "Android 14",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
