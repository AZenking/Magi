/**
 * PrepareM3uSync no-side-effect test (008-pipeline-reliability T020, US2).
 *
 * Validates that the prepare (preview) phase does NOT mutate output data —
 * it only downloads/parses and stages a snapshot, without calling stableUpsert
 * or markMissing.
 */
import { describe, it, expect, vi } from "vitest";

// Mock downloadSource + parseM3U to avoid network calls, keep all other exports
vi.mock("@magi/backend-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@magi/backend-core")>();
  return {
    ...actual,
    downloadSource: vi.fn().mockResolvedValue({
      content: "#EXTM3U\n#EXTINF:-1,Test\nhttp://test.ts\n",
      statusCode: 200,
    }),
    parseM3U: vi.fn().mockReturnValue([
      { tvgId: "1", tvgName: "Test", tvgLogo: "", groupTitle: "G", displayName: "Test", streamUrl: "http://test.ts" },
    ]),
    generateChannelIdentity: vi.fn().mockReturnValue("id:test-1"),
    computeChangeItems: vi.fn().mockReturnValue([
      { type: "added", channelIdentity: "id:test-1", displayName: "Test", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://test.ts" },
    ]),
  };
});

import { PrepareM3uSyncUseCase } from "../prepare-m3u-sync.use-case";
import type { ISourceSyncRepository } from "@/domain/source-sync";

function makeRepo(): ISourceSyncRepository & { stableUpsert: ReturnType<typeof vi.fn>; markMissing: ReturnType<typeof vi.fn> } {
  return {
    loadSource: vi.fn().mockResolvedValue({
      id: "src-1",
      url: "http://test.m3u",
      headers: null,
      enabled: true,
      freshnessThresholdMinutes: 60,
      version: 1,
    }),
    stageSnapshot: vi.fn().mockResolvedValue({ snapshotId: "snap-1", itemCount: 5 }),
    loadCurrentChannels: vi.fn().mockResolvedValue([
      { id: "ch-1", channelIdentity: "id:1", displayName: "Channel 1", sourcePresence: "present", version: 1 },
    ]),
    stableUpsert: vi.fn(),
    markMissing: vi.fn(),
    recordSourceSync: vi.fn(),
  } as never;
}

describe("PrepareM3uSyncUseCase no-side-effect (T020)", () => {
  it("does NOT call stableUpsert during prepare", async () => {
    const repo = makeRepo();
    const uc = new PrepareM3uSyncUseCase(repo);

    await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(repo.stableUpsert).not.toHaveBeenCalled();
  });

  it("does NOT call markMissing during prepare", async () => {
    const repo = makeRepo();
    const uc = new PrepareM3uSyncUseCase(repo);

    await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(repo.markMissing).not.toHaveBeenCalled();
  });

  it("stages a snapshot and returns a result with summary", async () => {
    const repo = makeRepo();
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(repo.stageSnapshot).toHaveBeenCalledOnce();
    expect(result).toHaveProperty("snapshotId");
    expect(result).toHaveProperty("summary");
  });
});
