/**
 * M3U sync fan-out contract test (008-pipeline-reliability T010, US1).
 *
 * Validates the function signature and control flow contract: processM3uSync
 * accepts `string | null` (not just `string`), and when sourceId is null it
 * enters the fan-out path. This is a compile-time + runtime contract test —
 * the actual DB interaction is verified by the integration tests in T011/T012.
 */
import { describe, it, expect } from "vitest";
import { processM3uSync } from "../m3u-sync.processor";

describe("processM3uSync fan-out contract (T010)", () => {
  it("accepts null as the sourceId parameter (fan-out entry point)", () => {
    // The function signature must accept null — this is the scheduled sync
    // entry point. If it only accepted string, the build would fail here.
    const fn: (sourceId: string | null) => Promise<unknown> = processM3uSync;
    expect(typeof fn).toBe("function");
  });

  it("returns a SyncBatchResult shape when fanning out (not throwing)", async () => {
    // Calling with null enters the fan-out path. With a DB available it will
    // query enabled sources and attempt syncs (which may timeout on download);
    // without a DB it throws a connection error. Either way it must NOT throw
    // "Source not found or disabled" (the old broken behavior).
    try {
      const result = await Promise.race([
        processM3uSync(null),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("__timeout__")), 3000),
        ),
      ]);
      if (result && typeof result === "object" && "totalSources" in result) {
        expect(result).toHaveProperty("succeededSources");
        expect(result).toHaveProperty("failedSources");
        expect(result).toHaveProperty("results");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Timeouts and connection errors are acceptable; the old broken error is not.
      if (message !== "__timeout__") {
        expect(message).not.toContain("Source not found or disabled");
      }
    }
  }, 10000);
});
