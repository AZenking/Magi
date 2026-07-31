import { describe, expect, it } from "vitest";
import { derivePresenceStatus } from "../device-client.model";

describe("heartbeat presence rules", () => {
  const asOf = new Date("2026-07-31T00:02:30.000Z");

  it("uses the inclusive 150-second server boundary", () => {
    expect(derivePresenceStatus({ status: "active", lastHeartbeatAt: new Date("2026-07-31T00:00:00.000Z") }, asOf)).toBe("online");
    expect(derivePresenceStatus({ status: "active", lastHeartbeatAt: new Date("2026-07-30T23:59:59.999Z") }, asOf)).toBe("offline");
  });

  it("does not let revoked state recover from a recent heartbeat", () => {
    expect(derivePresenceStatus({ status: "revoked", lastHeartbeatAt: asOf }, asOf)).toBe("revoked");
  });

  it("treats a missing heartbeat as offline without trusting a client timestamp", () => {
    expect(derivePresenceStatus({ status: "active", lastHeartbeatAt: null }, asOf)).toBe("offline");
  });
});
