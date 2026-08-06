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

  it("emits a revoked_access_rejected audit event when a revoked client heartbeats (T039)", async () => {
    const repo = repository({ kind: "revoked" });
    const audit = { execute: vi.fn(async () => ({ auditEventId: "a-1" })) };
    const useCase = new RecordHeartbeatUseCase(repo, undefined, audit as never);

    await expect(
      useCase.execute({
        deviceClientId: "device-revoked",
        appVersion: "1.0.0",
        platformVersion: "Android 14",
        requestId: "req-42",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "device_client.revoked_access_rejected",
        targetType: "device_client",
        targetId: "device-revoked",
        result: "failed",
        requestId: "req-42",
      }),
    );
  });

  it("still rejects when the audit writer rejects (observability never blocks the response)", async () => {
    const repo = repository({ kind: "revoked" });
    const audit = { execute: vi.fn().mockRejectedValue(new Error("db down")) };
    const useCase = new RecordHeartbeatUseCase(repo, undefined, audit as never);

    await expect(
      useCase.execute({
        deviceClientId: "device-revoked",
        appVersion: "1.0.0",
        platformVersion: "Android 14",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("does not audit a successful heartbeat (FR-016 no per-success noise)", async () => {
    const repo = repository({
      kind: "updated",
      lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const audit = { execute: vi.fn(async () => ({ auditEventId: "a-2" })) };
    const useCase = new RecordHeartbeatUseCase(repo, undefined, audit as never);

    await useCase.execute({
      deviceClientId: "device-1",
      appVersion: "1.0.0",
      platformVersion: "Android 14",
    });

    expect(audit.execute).not.toHaveBeenCalled();
  });

  it("includes contentRevision when the manifest is available", async () => {
    const repo = repository({
      kind: "updated",
      lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const manifest = { getCurrent: vi.fn(async () => "rev-2026-08") };
    const useCase = new RecordHeartbeatUseCase(
      repo,
      manifest as never,
      undefined,
    );

    const result = await useCase.execute({
      deviceClientId: "device-1",
      appVersion: "1.0.0",
      platformVersion: "Android 14",
    });

    expect(result.contentRevision).toBe("rev-2026-08");
  });

  it("tolerates a failing manifest read without failing the heartbeat", async () => {
    const repo = repository({
      kind: "updated",
      lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const manifest = {
      getCurrent: vi.fn().mockRejectedValue(new Error("manifest down")),
    };
    const useCase = new RecordHeartbeatUseCase(
      repo,
      manifest as never,
      undefined,
    );

    const result = await useCase.execute({
      deviceClientId: "device-1",
      appVersion: "1.0.0",
      platformVersion: "Android 14",
    });

    expect(result.contentRevision).toBeUndefined();
  });
});
