import { describe, expect, it } from "vitest";
import { resolveActiveSection } from "./app-menu";

describe("account navigation", () => {
  it("activates the account section for list and authorization routes", () => {
    expect(resolveActiveSection("/dashboard/account/clients")).toBe("account");
    expect(resolveActiveSection("/dashboard/account/clients/authorize")).toBe("account");
    expect(resolveActiveSection("/dashboard/oauth-clients")).toBe("open-api");
  });
});
