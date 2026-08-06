import { describe, expect, it } from "vitest";
import { UserCodeSchema } from "@magi/types";

describe("account device authorization contract", () => {
  it("normalizes the displayed short code before lookup", () => {
    expect(UserCodeSchema.parse("abcd2345")).toBe("ABCD2345");
    expect(UserCodeSchema.parse("ABCD-2345")).toBe("ABCD2345");
    expect(UserCodeSchema.safeParse("AAAA-0000").success).toBe(false);
  });
});
