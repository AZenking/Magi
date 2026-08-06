/**
 * ApplyM3uSync atomic test (008-pipeline-reliability T021, US2).
 *
 * Validates that the apply phase calls stableUpsert for each channel in the
 * snapshot and markMissing for disappeared channels, and that a failure in
 * stableUpsert propagates (so the caller can handle rollback).
 */
import { describe, it, expect, vi } from "vitest";
import { ApplyM3uSyncUseCase } from "../apply-m3u-sync.use-case";
import type { ISourceSyncRepository } from "@/domain/source-sync";

function makeRepo() {
  return {
    loadSource: vi.fn(),
    stageSnapshot: vi.fn(),
    loadCurrentChannels: vi.fn(),
    stableUpsert: vi.fn().mockResolvedValue({ id: "ch-new", created: true }),
    markMissing: vi.fn().mockResolvedValue(0),
    recordSourceSync: vi.fn().mockResolvedValue(undefined),
  };
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
