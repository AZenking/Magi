import { describe, expect, it } from "vitest";
import {
  canRename,
  canRevoke,
  derivePresenceStatus,
  isDisplayNameValid,
  normalizeDisplayName,
} from "../device-client.model";

const at = (secondsFromNow: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, secondsFromNow));

describe("device client domain rules", () => {
  it("derives online at the inclusive 150-second boundary", () => {
    const asOf = at(300);
    expect(
      derivePresenceStatus({ status: "active", lastHeartbeatAt: at(150) }, asOf),
    ).toBe("online");
    expect(
      derivePresenceStatus({ status: "active", lastHeartbeatAt: at(149) }, asOf),
    ).toBe("offline");
  });

  it("always gives revoked precedence over a recent heartbeat", () => {
    expect(
      derivePresenceStatus(
        { status: "revoked", lastHeartbeatAt: new Date() },
        new Date(),
      ),
    ).toBe("revoked");
  });

  it("trims names and rejects invisible/control characters", () => {
    expect(normalizeDisplayName("  客厅电视  ")).toBe("客厅电视");
    expect(isDisplayNameValid("  客厅电视  ")).toBe(true);
    expect(isDisplayNameValid("\u200b电视")).toBe(false);
    expect(isDisplayNameValid("x".repeat(65))).toBe(false);
    expect(isDisplayNameValid(" ")).toBe(false);
  });

  it("allows only active clients to transition", () => {
    expect(canRename({ status: "active" })).toBe(true);
    expect(canRename({ status: "revoked" })).toBe(false);
    expect(canRevoke({ status: "active" })).toBe(true);
    expect(canRevoke({ status: "revoked" })).toBe(false);
  });
});
