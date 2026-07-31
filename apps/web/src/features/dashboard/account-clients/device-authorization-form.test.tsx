import { describe, expect, it } from "vitest";
import { normalizeUserCode } from "./device-authorization-form";

describe("device authorization form", () => {
  it("normalizes short codes without rendering device secrets", () => {
    expect(normalizeUserCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeUserCode("abcd23456789")).toBe("ABCD2345");
  });
});
