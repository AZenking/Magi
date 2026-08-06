import { describe, expect, it } from "vitest";
import { redactUrlForLogs } from "./logger.module";

describe("API request log redaction", () => {
  it("removes device user codes from path and query values", () => {
    const redacted = redactUrlForLogs(
      "/api/account/device-authorizations/ABCD-2345?code=ABCD-2345&device_code=secret",
    );
    expect(redacted).not.toContain("ABCD-2345");
    expect(redacted).not.toContain("secret");
    expect(redacted).toContain("[REDACTED]");
  });
});
