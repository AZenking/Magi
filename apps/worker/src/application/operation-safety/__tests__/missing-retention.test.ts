/**
 * Missing-source-stream retention unit tests (009-m3u-control-plane T023).
 *
 * Verifies the contract for source-stream missing-retention + 30-day
 * reappearance + expiry purge. Uses a mock repository so the test runs
 * without Postgres.
 */
import { describe, it, expect, vi } from "vitest";
import { ApplyM3uSyncUseCase } from "../apply-m3u-sync.use-case";
import type { ISourceSyncRepository } from "@/domain/source-sync";

function makeRepo(): ISourceSyncRepository & {
  loadSource: ReturnType<typeof vi.fn>;
  loadPresentChannels: ReturnType<typeof vi.fn>;
  loadCurrentChannels: ReturnType<typeof vi.fn>;
  stageSnapshot: ReturnType<typeof vi.fn>;
  stageSnapshotIdempotent: ReturnType<typeof vi.fn>;
  stableUpsert: ReturnType<typeof vi.fn>;
  markMissing: ReturnType<typeof vi.fn>;
  applyAtomic: ReturnType<typeof vi.fn>;
  restoreMissing: ReturnType<typeof vi.fn>;
  purgeExpiredMissing: ReturnType<typeof vi.fn>;
  recordSourceSync: ReturnType<typeof vi.fn>;
} {
  return {
    loadSource: vi.fn(),
    stageSnapshot: vi.fn(),
    stageSnapshotIdempotent: vi.fn(),
    loadCurrentChannels: vi.fn().mockResolvedValue([]),
    loadPresentChannels: vi.fn().mockResolvedValue([]),
    stableUpsert: vi.fn(),
    markMissing: vi.fn(),
    applyAtomic: vi.fn().mockResolvedValue({
      sourcesActivated: 0,
      sourcesDeactivated: 0,
      streamsMissing: 0,
      streamsRestored: 0,
    }),
    restoreMissing: vi.fn().mockResolvedValue(0),
    purgeExpiredMissing: vi.fn().mockResolvedValue({
      purgedSourceChannels: 0,
      purgedStreams: 0,
    }),
    recordSourceSync: vi.fn(),
  } as never;
}

describe("Missing-stream retention 009 (T023)", () => {
  it("restores a previously-missing channel inside applyAtomic", async () => {
    const repo = makeRepo();
    // Current state: ch-1 present, ch-2 missing (line disappeared last sync).
    repo.loadPresentChannels.mockResolvedValueOnce([
      {
        id: "ch-1",
        channelIdentity: "id:1",
        displayName: "C1",
        sourcePresence: "present",
        version: 1,
      },
    ]);
    repo.loadCurrentChannels.mockResolvedValueOnce([
      {
        id: "ch-1",
        channelIdentity: "id:1",
        displayName: "C1",
        sourcePresence: "present",
        version: 1,
      },
      {
        id: "ch-2",
        channelIdentity: "id:2",
        displayName: "C2",
        sourcePresence: "missing",
        version: 1,
      },
    ]);
    // Snapshot has both — ch-2 is reappearing.
    const loadItems = vi.fn().mockResolvedValue([
      {
        channelIdentity: "id:1",
        payload: {
          displayName: "C1",
          groupTitle: null,
          tvgId: null,
          tvgLogo: null,
          streamUrl: "http://1.ts",
        },
      },
      {
        channelIdentity: "id:2",
        payload: {
          displayName: "C2",
          groupTitle: null,
          tvgId: null,
          tvgLogo: null,
          streamUrl: "http://2.ts",
        },
      },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-1",
      sourceVersion: 1,
    });

    expect(repo.applyAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ restoreSourceChannelIds: ["ch-2"] }),
    );
    expect(repo.restoreMissing).not.toHaveBeenCalled();
  });

  it("missing source channels get marked via applyAtomic (no delete)", async () => {
    const repo = makeRepo();
    repo.loadPresentChannels.mockResolvedValueOnce([
      {
        id: "ch-1",
        channelIdentity: "id:1",
        displayName: "C1",
        sourcePresence: "present",
        version: 1,
      },
      {
        id: "ch-2",
        channelIdentity: "id:2",
        displayName: "C2",
        sourcePresence: "present",
        version: 1,
      },
    ]);
    repo.loadCurrentChannels.mockResolvedValueOnce([
      {
        id: "ch-1",
        channelIdentity: "id:1",
        displayName: "C1",
        sourcePresence: "present",
        version: 1,
      },
      {
        id: "ch-2",
        channelIdentity: "id:2",
        displayName: "C2",
        sourcePresence: "present",
        version: 1,
      },
    ]);
    // Snapshot only has ch-1 — ch-2 disappears.
    const loadItems = vi.fn().mockResolvedValue([
      {
        channelIdentity: "id:1",
        payload: {
          displayName: "C1",
          groupTitle: null,
          tvgId: null,
          tvgLogo: null,
          streamUrl: "http://1.ts",
        },
      },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    const result = await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-1",
      sourceVersion: 1,
    });

    expect(repo.applyAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        missingSourceChannelIds: ["ch-2"],
      }),
    );
    // No restore needed (nothing reappearing)
    expect(repo.restoreMissing).not.toHaveBeenCalled();
    expect(result.applied).toBe(true);
  });

  it("purgeExpiredMissing with 30-day window reports purged counts", async () => {
    const repo = makeRepo();
    repo.purgeExpiredMissing.mockResolvedValueOnce({
      purgedSourceChannels: 3,
      purgedStreams: 5,
    });
    const cutoff = new Date("2026-09-07T00:00:00Z");
    const retention = 30 * 24 * 60 * 60; // 30 days in seconds

    const result = await repo.purgeExpiredMissing(null, retention, cutoff);

    expect(result.purgedSourceChannels).toBe(3);
    expect(result.purgedStreams).toBe(5);
    expect(repo.purgeExpiredMissing).toHaveBeenCalledWith(
      null,
      retention,
      cutoff,
    );
  });
});
