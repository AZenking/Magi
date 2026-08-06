import { describe, expect, it } from "vitest";
import { accountClientKeys } from "./client-queries";
import { deviceClientFixture } from "@/test/device-client-fixtures";

describe("account client management query contract", () => {
  it("keeps pagination in the query key for stable server pages", () => {
    expect(accountClientKeys.list({ page: 2, pageSize: 50 })).toEqual([
      "account-device-clients",
      { page: 2, pageSize: 50 },
    ]);
  });

  it("uses privacy-safe list data", () => {
    const json = JSON.stringify(deviceClientFixture);
    expect(json).not.toContain("access_token");
    expect(json).not.toContain("client_secret");
    expect(json).not.toContain("playback");
  });
});
