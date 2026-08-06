/**
 * AUDIT_ACTIONS catalogue + changedFieldNames (T050).
 *
 * The audit action strings are a stable contract: they must not drift when
 * HTTP routes are renamed, because they drive audit filters and exports.
 */
import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, changedFieldNames } from "@/domain/audit/audit-actions";

describe("AUDIT_ACTIONS.deviceClient (007 lifecycle)", () => {
  it("exposes the stable device-client lifecycle actions", () => {
    expect(AUDIT_ACTIONS.deviceClient).toEqual({
      register: "device_client.registered",
      autoRegister: "device_client.auto_registered",
      rename: "device_client.renamed",
      revoke: "device_client.revoked",
      restore: "device_client.restored",
      revokedAccessRejected: "device_client.revoked_access_rejected",
    });
  });

  it("uses dotted lowercase strings with no route coupling", () => {
    const all = Object.values(AUDIT_ACTIONS.deviceClient);
    for (const action of all) {
      expect(action).toMatch(/^device_client\.[a-z_]+$/);
    }
  });
});

describe("AUDIT_ACTIONS catalogue stability", () => {
  it("every group uses snake_case dotted values", () => {
    for (const group of Object.values(AUDIT_ACTIONS)) {
      for (const value of Object.values(group)) {
        expect(value).toMatch(/^[a-z][a-z0-9_.]*$/);
      }
    }
  });

  it("all action values are unique across the catalogue", () => {
    const all = Object.values(AUDIT_ACTIONS).flatMap((g) => Object.values(g));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("changedFieldNames", () => {
  it("returns sorted keys of the changed-field summary", () => {
    expect(changedFieldNames({ displayName: "x", status: "active" })).toEqual([
      "displayName",
      "status",
    ]);
  });

  it("sorts regardless of insertion order", () => {
    expect(changedFieldNames({ zeta: 1, alpha: 2, middle: 3 })).toEqual([
      "alpha",
      "middle",
      "zeta",
    ]);
  });

  it("returns an empty array for an empty object", () => {
    expect(changedFieldNames({})).toEqual([]);
  });
});
