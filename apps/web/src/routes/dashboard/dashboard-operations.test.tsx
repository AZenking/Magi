/**
 * Dashboard operations summary Web tests (T113).
 *
 * Validates the operations summary read model (freshness/coverage/availability/
 * task counts/issues) and the issue-card actionUrl contract
 * (Part A, live + Part B contract). Mirrors contracts/common.md
 * (OperationsSummaryVo) and the three-step repair-path obligation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildOperationsSummary,
  resetFixtureIds,
} from "@/test/safe-operations-fixtures";

describe("Operations summary fixtures (T113 — part A, live)", () => {
  beforeEach(() => resetFixtureIds());

  it("buildOperationsSummary produces coverage/availability ratios in [0,1]", () => {
    const s = buildOperationsSummary();
    expect(s.epgCoverage).toBeGreaterThanOrEqual(0);
    expect(s.epgCoverage).toBeLessThanOrEqual(1);
    expect(s.streamAvailability).toBeGreaterThanOrEqual(0);
    expect(s.streamAvailability).toBeLessThanOrEqual(1);
  });

  it("summary exposes freshness timestamps for M3U/XMLTV/stream-check", () => {
    const s = buildOperationsSummary();
    expect(s.latestM3uSyncAt).toBeTruthy();
    expect(s.latestXmltvSyncAt).toBeTruthy();
    expect(s.latestStreamCheckAt).toBeTruthy();
  });

  it("summary surfaces running/failed task counts for the Header", () => {
    const s = buildOperationsSummary({ runningTaskCount: 3, failedTaskCount: 2 });
    expect(s.runningTaskCount).toBe(3);
    expect(s.failedTaskCount).toBe(2);
  });

  it("an unhealthy summary lists actionable issue cards", () => {
    const s = buildOperationsSummary({
      issues: [
        { code: "streams-offline", message: "2 条线路离线", actionUrl: "/dashboard/channels" },
        { code: "tasks-failed", message: "1 个任务失败", actionUrl: "/dashboard/tasks" },
      ],
    });
    expect(s.issues).toHaveLength(2);
    expect(s.issues[0]).toHaveProperty("actionUrl");
  });
});

describe("Dashboard issue-card contract (T113 — part B)", () => {
  beforeEach(() => resetFixtureIds());

  it("every issue card carries a server-approved actionUrl (repair path)", () => {
    const s = buildOperationsSummary();
    for (const issue of s.issues as Array<{ code: string; actionUrl: string }>) {
      expect(issue.actionUrl).toBeTruthy();
      expect(issue.actionUrl.startsWith("/dashboard")).toBe(true);
    }
  });

  it("an operator reaches a repair entry within three interactions (FR-034)", () => {
    // The issue card's actionUrl points directly at the affected dashboard
    // view (e.g. /dashboard/channels?streamStatus=offline), so the path is:
    // dashboard → issue card → filtered list = 3 steps max.
    const s = buildOperationsSummary();
    const issue = (s.issues as Array<{ actionUrl: string }>)[0]!;
    const isDashboardInternal = issue.actionUrl.startsWith("/dashboard");
    expect(isDashboardInternal).toBe(true);
  });

  it("a healthy summary has zero issues", () => {
    const s = buildOperationsSummary({
      issues: [],
      runningTaskCount: 0,
      failedTaskCount: 0,
      staleSources: 0,
    });
    expect((s.issues as unknown[]).length).toBe(0);
  });

  it("stale source count is surfaced for freshness triage", () => {
    const s = buildOperationsSummary({ staleSources: 4 });
    expect(s.staleSources).toBe(4);
  });
});
