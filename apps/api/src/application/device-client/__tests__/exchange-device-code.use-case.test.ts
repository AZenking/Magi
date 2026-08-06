import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ExchangeDeviceCodeUseCase } from "../exchange-device-code.use-case";

function grantRepository(result: unknown) {
  return {
    findAuthorizationByDeviceCode: vi.fn(async () => ({
      id: "grant-1",
      oauthClientId: "oauth-1",
      status: "approved",
      ownerUserId: "user-1",
      approvedDisplayName: "客厅电视",
      requestedDisplayName: null,
      deviceType: "android_tv",
      platform: "android",
      platformVersion: "Android 14",
      appVersion: "1.0.0",
      identitySummary: "Magi TV",
      expiresAt: new Date(Date.now() + 60_000),
      pollIntervalSeconds: 5,
      lastPolledAt: null,
      approvedAt: null,
      consumedAt: null,
      deviceClientId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    consumeAuthorization: vi.fn(async () => result),
  } as never;
}

function oauthRepository() {
  return {
    findByClientId: vi.fn(async () => ({
      id: "oauth-1",
      clientId: "magi_tv",
      clientName: "Magi TV",
      clientKind: "public_device",
      secretHash: null,
      secretPrefix: null,
      status: "active",
    })),
  } as never;
}

describe("ExchangeDeviceCodeUseCase", () => {
  it("uses the RFC 8628 authorization_pending code while waiting", async () => {
    const useCase = new ExchangeDeviceCodeUseCase(
      grantRepository({ kind: "pending" }),
      oauthRepository(),
    );
    await expect(
      useCase.execute({ clientId: "magi_tv", deviceCode: "a".repeat(32) }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "authorization_pending" }),
    });
  });

  it("preserves slow_down for clients polling too quickly", async () => {
    const useCase = new ExchangeDeviceCodeUseCase(
      grantRepository({ kind: "slow_down" }),
      oauthRepository(),
    );
    await expect(
      useCase.execute({ clientId: "magi_tv", deviceCode: "a".repeat(32) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
