import { describe, expect, it, vi } from "vitest";
import type { ISourceSyncRepository } from "@/domain/source-sync";
import {
  ApplySourceDeleteUseCase,
  PrepareSourceDeleteUseCase,
} from "./source-delete.use-cases";

function repositoryMock(): ISourceSyncRepository {
  return {
    loadSource: vi.fn(),
    stageSnapshot: vi.fn(),
    stageSnapshotIdempotent: vi.fn(),
    loadCurrentChannels: vi.fn(),
    loadPresentChannels: vi.fn(),
    stableUpsert: vi.fn(),
    markMissing: vi.fn(),
    applyAtomic: vi.fn(),
    recordSourceSync: vi.fn(),
    restoreMissing: vi.fn(),
    purgeExpiredMissing: vi.fn(),
    prepareSourceDelete: vi.fn(),
    applySourceDelete: vi.fn(),
  };
}

describe("source-delete use cases", () => {
  it("prepares a disabled source without routing through m3u sync", async () => {
    const repo = repositoryMock();
    const impact = {
      sourceId: "source-1",
      sourceName: "Disabled source",
      sourceType: "m3u" as const,
      counts: {
        rawChannels: 4,
        channels: 3,
        programmes: 0,
        epgMappings: 0,
        canonicalMemberships: 2,
        streams: 3,
        schedules: 1,
      },
    };
    vi.mocked(repo.prepareSourceDelete).mockResolvedValue(impact);

    await expect(
      new PrepareSourceDeleteUseCase(repo).execute("source-1"),
    ).resolves.toEqual(impact);
    expect(repo.prepareSourceDelete).toHaveBeenCalledWith("source-1");
    expect(repo.loadSource).not.toHaveBeenCalled();
  });

  it("delegates apply to the source-delete transaction", async () => {
    const repo = repositoryMock();
    const result = {
      sourceId: "source-1",
      sourceName: "Source",
      sourceType: "m3u" as const,
      counts: {
        rawChannels: 0,
        channels: 0,
        programmes: 0,
        epgMappings: 0,
        canonicalMemberships: 0,
        streams: 0,
        schedules: 0,
      },
      deleted: true,
    };
    vi.mocked(repo.applySourceDelete).mockResolvedValue(result);

    await expect(
      new ApplySourceDeleteUseCase(repo).execute("source-1"),
    ).resolves.toEqual(result);
    expect(repo.applySourceDelete).toHaveBeenCalledWith("source-1");
  });
});
