/**
 * PrepareM3uSync no-side-effect test (008-pipeline-reliability T020, US2;
 * 009-m3u-control-plane T011 adds immutable-snapshot, source-version,
 * fingerprint-reuse and 25%-anomaly classification cases).
 *
 * Validates that the prepare (preview) phase does NOT mutate output data —
 * it only downloads/parses and stages a snapshot, without calling stableUpsert
 * or markMissing. The 009 additions also verify:
 *   - the snapshot is staged via the idempotent path (reused on repeat)
 *   - the change set records sourceVersion, requiresConfirmation, warnings
 *   - 25% deletion ratio flips requiresConfirmation to true (FR-016)
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

function makeRepo(): ISourceSyncRepository & {
  stableUpsert: ReturnType<typeof vi.fn>;
  markMissing: ReturnType<typeof vi.fn>;
  stageSnapshot: ReturnType<typeof vi.fn>;
  stageSnapshotIdempotent: ReturnType<typeof vi.fn>;
  loadCurrentChannels: ReturnType<typeof vi.fn>;
  loadPresentChannels: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  recordSourceSync: ReturnType<typeof vi.fn>;
  applyAtomic: ReturnType<typeof vi.fn>;
  restoreMissing: ReturnType<typeof vi.fn>;
  purgeExpiredMissing: ReturnType<typeof vi.fn>;
} {
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
    stageSnapshotIdempotent: vi
      .fn()
      .mockResolvedValue({ snapshotId: "snap-1", itemCount: 5, reused: false }),
    loadCurrentChannels: vi.fn().mockResolvedValue([
      { id: "ch-1", channelIdentity: "id:1", displayName: "Channel 1", sourcePresence: "present", version: 1 },
    ]),
    loadPresentChannels: vi.fn().mockResolvedValue([
      { id: "ch-1", channelIdentity: "id:1", displayName: "Channel 1", sourcePresence: "present", version: 1 },
    ]),
    stableUpsert: vi.fn(),
    markMissing: vi.fn(),
    recordSourceSync: vi.fn(),
    applyAtomic: vi.fn(),
    restoreMissing: vi.fn(),
    purgeExpiredMissing: vi.fn(),
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

    // 009 changed the contract: stage via the idempotent path so fingerprint
    // reuse returns the existing snapshot without re-inserting items.
    expect(repo.stageSnapshotIdempotent).toHaveBeenCalledOnce();
    expect(repo.stageSnapshot).not.toHaveBeenCalled();
    expect(result).toHaveProperty("snapshotId");
    expect(result).toHaveProperty("summary");
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane (T011) — immutable snapshot, version checks,
// fingerprint reuse, 25% anomaly classification.
// ---------------------------------------------------------------------------

describe("PrepareM3uSyncUseCase 009 prepare-path (T011)", () => {
  it("stages via stageSnapshotIdempotent and surfaces reuse flag (FR-016)", async () => {
    const repo = makeRepo();
    repo.stageSnapshotIdempotent.mockResolvedValueOnce({
      snapshotId: "snap-reused",
      itemCount: 5,
      reused: true,
    });
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(repo.stageSnapshotIdempotent).toHaveBeenCalledOnce();
    expect(repo.stageSnapshot).not.toHaveBeenCalled();
    expect(result.snapshotId).toBe("snap-reused");
    expect(result.reused).toBe(true);
  });

  it("captures sourceVersion from the loaded source and returns it", async () => {
    const repo = makeRepo();
    repo.loadSource.mockResolvedValueOnce({
      id: "src-1",
      url: "http://test.m3u",
      headers: null,
      enabled: true,
      freshnessThresholdMinutes: 60,
      version: 7,
    });
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(result.sourceVersion).toBe(7);
    // stageSnapshotIdempotent takes positional args; sourceVersion is 4th.
    expect(repo.stageSnapshotIdempotent).toHaveBeenCalledWith(
      "src-1",
      "m3u",
      expect.any(String),
      7,
      expect.any(Array),
      "task-1",
    );
  });

  it("classifies 25% deletion as requiresConfirmation with anomaly warning (FR-016)", async () => {
    const repo = makeRepo();
    // Current baseline: 4 present channels. Snapshot has 3 (one disappeared = 25%).
    repo.loadPresentChannels.mockResolvedValueOnce([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
      { id: "ch-2", channelIdentity: "id:2", displayName: "C2", sourcePresence: "present", version: 1 },
      { id: "ch-3", channelIdentity: "id:3", displayName: "C3", sourcePresence: "present", version: 1 },
      { id: "ch-4", channelIdentity: "id:4", displayName: "C4", sourcePresence: "present", version: 1 },
    ]);
    // Snapshot: only ch-1..ch-3 remain.
    const { parseM3U, computeChangeItems } = await import("@magi/backend-core");
    (parseM3U as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { tvgId: "1", tvgName: "C1", tvgLogo: "", groupTitle: "G", displayName: "C1", streamUrl: "http://1.ts" },
      { tvgId: "2", tvgName: "C2", tvgLogo: "", groupTitle: "G", displayName: "C2", streamUrl: "http://2.ts" },
      { tvgId: "3", tvgName: "C3", tvgLogo: "", groupTitle: "G", displayName: "C3", streamUrl: "http://3.ts" },
    ]);
    // Make computeChangeItems reflect the diff (3 unchanged + 1 mark_missing).
    (computeChangeItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { action: "preserve", channelIdentity: "id:1", selected: false },
      { action: "preserve", channelIdentity: "id:2", selected: false },
      { action: "preserve", channelIdentity: "id:3", selected: false },
      { action: "mark_missing", channelIdentity: "id:4", selected: false },
    ]);
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "deletion-ratio-exceeded" }),
      ]),
    );
  });

  it("classifies empty snapshot against non-empty baseline as requiresConfirmation", async () => {
    const repo = makeRepo();
    repo.loadPresentChannels.mockResolvedValueOnce([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
      { id: "ch-2", channelIdentity: "id:2", displayName: "C2", sourcePresence: "present", version: 1 },
    ]);
    const { parseM3U, computeChangeItems } = await import("@magi/backend-core");
    (parseM3U as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    // Empty snapshot → both channels go mark_missing.
    (computeChangeItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { action: "mark_missing", channelIdentity: "id:1", selected: false },
      { action: "mark_missing", channelIdentity: "id:2", selected: false },
    ]);
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "empty-snapshot" }),
      ]),
    );
  });

  it("does NOT flag confirmation on first import (currentPresent == 0)", async () => {
    const repo = makeRepo();
    repo.loadPresentChannels.mockResolvedValueOnce([]);
    const { computeChangeItems } = await import("@magi/backend-core");
    (computeChangeItems as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { action: "add", channelIdentity: "id:1", selected: true },
    ]);
    const uc = new PrepareM3uSyncUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-1",
      preparedTaskId: "task-1",
    });

    expect(result.requiresConfirmation).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("passes changeSetId through to stageSnapshotIdempotent for snapshot linkage", async () => {
    const repo = makeRepo();
    const uc = new PrepareM3uSyncUseCase(repo);

    await uc.execute({
      sourceId: "src-1",
      changeSetId: "cs-link-1",
      preparedTaskId: "task-1",
    });

    // preparedTaskId is the 6th positional arg of stageSnapshotIdempotent.
    expect(repo.stageSnapshotIdempotent).toHaveBeenCalledWith(
      "src-1",
      "m3u",
      expect.any(String),
      expect.any(Number),
      expect.any(Array),
      "task-1",
    );
  });
});
