import { describe, expect, it } from "vitest";
import { ApiError, formatApiError } from "./api";

describe("ApiError", () => {
  it("keeps problem code, detail and request id for actionable feedback", () => {
    const error = new ApiError(409, {
      code: "protected-client",
      title: "客户端受保护",
      detail: "不能禁用内置设备客户端",
      requestId: "req-123",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("protected-client");
    expect(formatApiError(error)).toBe("不能禁用内置设备客户端（请求 ID：req-123）");
  });
});
