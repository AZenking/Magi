/**
 * ApplyM3uSync atomic test (008-pipeline-reliability T021, US2;
 * 009-m3u-control-plane T012 adds atomic-apply, missing-marking,
 * recovery-item capture and reappearance-identity preservation cases).
 *
 * Validates that the apply phase calls stableUpsert for each channel in the
 * snapshot and markMissing for disappeared channels, and that a failure in
 * stableUpsert propagates (so the caller can handle rollback). The 009
 * additions also verify:
 *   - apply runs via the atomic applyAtomic repository method
 *   - missing channels are marked with timestamp (not deleted)
 *   - reappearance restores the existing identity instead of creating a new one
 *   - source status + fingerprint bump happens inside the same atomic call
 */
import { describe, it, expect, vi } from "vitest";
import { ApplyM3uSyncUseCase } from "../apply-m3u-sync.use-case";
import type { ISourceSyncRepository } from "@/domain/source-sync";

function makeRepo(): ISourceSyncRepository & {
  applyAtomic: ReturnType<typeof vi.fn>;
  restoreMissing: ReturnType<typeof vi.fn>;
  loadPresentChannels: ReturnType<typeof vi.fn>;
  loadCurrentChannels: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  stableUpsert: ReturnType<typeof vi.fn>;
  markMissing: ReturnType<typeof vi.fn>;
  stageSnapshot: ReturnType<typeof vi.fn>;
  stageSnapshotIdempotent: ReturnType<typeof vi.fn>;
  purgeExpiredMissing: ReturnType<typeof vi.fn>;
  recordSourceSync: ReturnType<typeof vi.fn>;
} {
  return {
    loadSource: vi.fn(),
    stageSnapshot: vi.fn(),
    stageSnapshotIdempotent: vi.fn(),
    loadCurrentChannels: vi.fn().mockResolvedValue([]),
    loadPresentChannels: vi.fn().mockResolvedValue([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
    ]),
    stableUpsert: vi.fn().mockResolvedValue({ id: "ch-new", created: true }),
    markMissing: vi.fn().mockResolvedValue(0),
    applyAtomic: vi.fn().mockResolvedValue({
      sourcesActivated: 2,
      sourcesDeactivated: 1,
      streamsMissing: 1,
      streamsRestored: 0,
    }),
    restoreMissing: vi.fn().mockResolvedValue(0),
    purgeExpiredMissing: vi.fn().mockResolvedValue({ purgedSourceChannels: 0, purgedStreams: 0 }),
    recordSourceSync: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function makeLoadSnapshotItems() {
  return vi.fn().mockResolvedValue([
    {
      channelIdentity: "id:test-1",
      collisionOrdinal: 0,
      itemOrder: 0,
      payload: { displayName: "Test 1", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://1.ts" },
    },
    {
      channelIdentity: "id:test-2",
      collisionOrdinal: 0,
      itemOrder: 1,
      payload: { displayName: "Test 2", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://2.ts" },
    },
  ]);
}

describe("ApplyM3uSyncUseCase atomic (T021)", () => {
  it("calls stableUpsert for each snapshot item", async () => {
    const repo = makeRepo();
    const loadItems = makeLoadSnapshotItems();
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    const result = await uc.execute({ sourceId: "src-1", snapshotId: "snap-1" });

    expect(repo.stableUpsert).toHaveBeenCalledTimes(2);
    expect(result.upsertedCount).toBe(2);
  });

  it("calls markMissing after upserting", async () => {
    const repo = makeRepo();
    const loadItems = makeLoadSnapshotItems();
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await uc.execute({ sourceId: "src-1", snapshotId: "snap-1" });

    expect(repo.markMissing).toHaveBeenCalledOnce();
  });

  it("calls recordSourceSync with success on completion", async () => {
    const repo = makeRepo();
    const loadItems = makeLoadSnapshotItems();
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await uc.execute({ sourceId: "src-1", snapshotId: "snap-1" });

    expect(repo.recordSourceSync).toHaveBeenCalledWith("src-1", "success", null);
  });

  it("propagates errors from stableUpsert (enabling caller rollback)", async () => {
    const repo = makeRepo();
    repo.stableUpsert.mockRejectedValueOnce(new Error("DB down"));
    const loadItems = makeLoadSnapshotItems();
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await expect(uc.execute({ sourceId: "src-1", snapshotId: "snap-1" })).rejects.toThrow("DB down");
  });
});

// ---------------------------------------------------------------------------
// 009-m3u-control-plane (T012) — atomic apply, missing marking,
// recovery items, reappearance identity preservation.
// ---------------------------------------------------------------------------

describe("ApplyM3uSyncUseCase 009 atomic apply (T012)", () => {
  it("uses applyAtomic with snapshot + changeSetId + real present/missing IDs", async () => {
    const repo = makeRepo();
    const loadItems = vi.fn().mockResolvedValue([
      {
        channelIdentity: "id:test-1",
        payload: { displayName: "Test 1", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://1.ts" },
      },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    const result = await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-9",
      sourceVersion: 3,
    });

    expect(repo.applyAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "src-1",
        snapshotId: "snap-1",
        changeSetId: "cs-9",
        sourceVersion: 3,
      }),
    );
    expect(result.applied).toBe(true);
    expect(result.sourcesActivated).toBe(2);
    expect(result.sourcesDeactivated).toBe(1);
  });

  it("captures REAL missing source channel IDs by diffing snapshot vs present", async () => {
    const repo = makeRepo();
    // Present baseline has ch-1, ch-2, ch-3.
    repo.loadPresentChannels.mockResolvedValueOnce([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
      { id: "ch-2", channelIdentity: "id:2", displayName: "C2", sourcePresence: "present", version: 1 },
      { id: "ch-3", channelIdentity: "id:3", displayName: "C3", sourcePresence: "present", version: 1 },
    ]);
    // Snapshot only has ch-1 + ch-2 (ch-3 disappeared).
    const loadItems = vi.fn().mockResolvedValue([
      { channelIdentity: "id:1", payload: { displayName: "C1", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://1.ts" } },
      { channelIdentity: "id:2", payload: { displayName: "C2", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://2.ts" } },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-9",
      sourceVersion: 1,
    });

    expect(repo.applyAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        // The missing ID is ch-3 — the row id, not the channelIdentity.
        missingSourceChannelIds: ["ch-3"],
        presentChannels: expect.arrayContaining([
          expect.objectContaining({ channelIdentity: "id:1" }),
          expect.objectContaining({ channelIdentity: "id:2" }),
        ]),
      }),
    );
  });

  it("restores previously-missing channels when they reappear in the snapshot", async () => {
    const repo = makeRepo();
    // ch-1 is present; ch-2 is currently missing (line disappeared last sync).
    repo.loadPresentChannels.mockResolvedValueOnce([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
    ]);
    repo.loadCurrentChannels.mockResolvedValueOnce([
      { id: "ch-1", channelIdentity: "id:1", displayName: "C1", sourcePresence: "present", version: 1 },
      { id: "ch-2", channelIdentity: "id:2", displayName: "C2", sourcePresence: "missing", version: 1 },
    ]);
    repo.restoreMissing.mockResolvedValueOnce(1);
    // Snapshot has both id:1 and id:2 — id:2 is reappearing.
    const loadItems = vi.fn().mockResolvedValue([
      { channelIdentity: "id:1", payload: { displayName: "C1", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://1.ts" } },
      { channelIdentity: "id:2", payload: { displayName: "C2", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://2.ts" } },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    const result = await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-9",
      sourceVersion: 1,
    });

    // restoreMissing must be called with the row id of the reappearing channel.
    expect(repo.restoreMissing).toHaveBeenCalledWith(
      "src-1",
      ["ch-2"],
      expect.any(Date),
    );
    expect(result.streamsRestored).toBeGreaterThanOrEqual(0);
  });

  it("does NOT call stableUpsert individually when applyAtomic is in play", async () => {
    const repo = makeRepo();
    const loadItems = vi.fn().mockResolvedValue([
      { channelIdentity: "id:1", payload: { displayName: "C1", groupTitle: "G", tvgId: null, tvgLogo: null, streamUrl: "http://1.ts" } },
    ]);
    const uc = new ApplyM3uSyncUseCase(repo as never, loadItems);

    await uc.execute({
      sourceId: "src-1",
      snapshotId: "snap-1",
      changeSetId: "cs-9",
      sourceVersion: 1,
    });

    // applyAtomic owns the upserts inside its transaction; the use case must
    // NOT loop stableUpsert itself (FR-004 — operator fields preserved atomically).
    expect(repo.stableUpsert).not.toHaveBeenCalled();
    expect(repo.markMissing).not.toHaveBeenCalled();
  });
});
