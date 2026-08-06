import { describe, expect, it } from "vitest";
import {
  canRename,
  canRevoke,
  isDisplayNameValid,
  normalizeDisplayName,
} from "../device-client.model";

describe("rename and revoke rules", () => {
  it("trims printable names and enforces the 1–64 character boundary", () => {
    expect(normalizeDisplayName("  客厅电视  ")).toBe("客厅电视");
    expect(isDisplayNameValid("x".repeat(64))).toBe(true);
    expect(isDisplayNameValid("x".repeat(65))).toBe(false);
    expect(isDisplayNameValid("\u0000")).toBe(false);
  });

  it("allows only active clients to be renamed or revoked", () => {
    expect(canRename({ status: "active" })).toBe(true);
    expect(canRevoke({ status: "active" })).toBe(true);
    expect(canRename({ status: "revoked" })).toBe(false);
    expect(canRevoke({ status: "revoked" })).toBe(false);
  });
});
