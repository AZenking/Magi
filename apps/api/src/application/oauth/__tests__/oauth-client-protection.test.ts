import { describe, expect, it, vi } from "vitest";
import { DeleteOauthClientUseCase } from "../delete-oauth-client.use-case";
import { TransitionOauthClientStatusUseCase } from "../transition-oauth-client-status.use-case";

const builtIn = {
  id: "oauth-a",
  clientId: "magi_tv",
  clientName: "Magi TV",
  clientKind: "public_device" as const,
  secretHash: null,
  secretPrefix: null,
  status: "active" as const,
  lastUsedAt: null,
  createdBy: "admin",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("built-in device OAuth client protection", () => {
  it("rejects disabling/revoking a public device client", async () => {
    const useCase = new TransitionOauthClientStatusUseCase(
      { findById: vi.fn(async () => builtIn) } as never,
      { revokeByClientId: vi.fn() } as never,
    );

    await expect(useCase.execute("oauth-a", "disabled")).rejects.toMatchObject({
      response: { code: "protected-client" },
    });
  });

  it("rejects physical deletion of a public device client", async () => {
    const useCase = new DeleteOauthClientUseCase({
      findById: vi.fn(async () => builtIn),
      deleteById: vi.fn(),
    } as never);

    await expect(useCase.execute("oauth-a")).rejects.toMatchObject({
      response: { code: "protected-client" },
    });
  });
});
