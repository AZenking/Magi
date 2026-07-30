/**
 * ApiKeyModel state-machine tests (T016, TDD — Red first).
 *
 * Guards the status machine (data-model.md): active⇄disabled reversible,
 * revoked terminal, isUsable honors expiry + status.
 */
import { describe, it, expect } from "vitest";
import { ApiKeyModel, type ApiKey } from "../api-key.model";

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "key-1",
    name: "test",
    keyHash: "hash",
    keyPrefix: "magi_abcd…",
    status: "active",
    expiresAt: null,
    scopes: null,
    lastUsedAt: null,
    createdBy: "admin",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("ApiKeyModel.isUsable", () => {
  it("active + no expiry → usable", () => {
    expect(new ApiKeyModel(makeKey()).isUsable()).toBe(true);
  });

  it("active + future expiry → usable", () => {
    const future = new Date(Date.now() + 60_000);
    expect(new ApiKeyModel(makeKey({ expiresAt: future })).isUsable()).toBe(true);
  });

  it("active + past expiry → NOT usable", () => {
    const past = new Date(Date.now() - 60_000);
    expect(new ApiKeyModel(makeKey({ expiresAt: past })).isUsable()).toBe(false);
  });

  it("disabled → NOT usable regardless of expiry", () => {
    expect(new ApiKeyModel(makeKey({ status: "disabled" })).isUsable()).toBe(false);
  });

  it("revoked → NOT usable", () => {
    expect(new ApiKeyModel(makeKey({ status: "revoked" })).isUsable()).toBe(false);
  });
});

describe("ApiKeyModel.canTransitionTo", () => {
  it("active ⇄ disabled (reversible)", () => {
    expect(new ApiKeyModel(makeKey({ status: "active" })).canTransitionTo("disabled")).toBe(true);
    expect(new ApiKeyModel(makeKey({ status: "disabled" })).canTransitionTo("active")).toBe(true);
  });

  it("active → revoked", () => {
    expect(new ApiKeyModel(makeKey({ status: "active" })).canTransitionTo("revoked")).toBe(true);
  });

  it("disabled → revoked", () => {
    expect(new ApiKeyModel(makeKey({ status: "disabled" })).canTransitionTo("revoked")).toBe(true);
  });

  it("revoked → anything is FORBIDDEN (terminal)", () => {
    const revoked = new ApiKeyModel(makeKey({ status: "revoked" }));
    expect(revoked.canTransitionTo("active")).toBe(false);
    expect(revoked.canTransitionTo("disabled")).toBe(false);
  });

  it("same-status transition is FORBIDDEN", () => {
    expect(new ApiKeyModel(makeKey({ status: "active" })).canTransitionTo("active")).toBe(false);
    expect(new ApiKeyModel(makeKey({ status: "disabled" })).canTransitionTo("disabled")).toBe(false);
  });
});
