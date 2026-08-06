/**
 * ApplyRecoveryRestore test (008-pipeline-reliability T022, US2).
 *
 * Validates that the restore use case calls restoreObject for each item in
 * order, and returns the count of restored items.
 */
import { describe, it, expect, vi } from "vitest";
import { ApplyRecoveryRestoreUseCase } from "../apply-recovery-restore.use-case";
import type { RestoreItem, IRestorePort } from "../apply-recovery-restore.use-case";

function makeItems(count: number): RestoreItem[] {
  return Array.from({ length: count }, (_, i) => ({
    entityType: "channel",
    entityId: `entity-${i}`,
    entityVersion: 1,
    payload: { displayName: `Channel ${i}`, channelIdentity: `id:${i}` },
    itemOrder: i,
  }));
}

function makeRestorePort(): IRestorePort {
  return { restoreObject: vi.fn().mockResolvedValue(undefined) };
}

describe("ApplyRecoveryRestoreUseCase (T022)", () => {
  it("calls restoreObject for each item in order", async () => {
    const port = makeRestorePort();
    const uc = new ApplyRecoveryRestoreUseCase(port);
    const items = makeItems(3);

    const result = await uc.execute({ recoveryPointId: "rp-1", items });

    expect(port.restoreObject).toHaveBeenCalledTimes(3);
    // Items must be restored in itemOrder.
    const calls = (port.restoreObject as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].entityId).toBe("entity-0");
    expect(calls[2]![0].entityId).toBe("entity-2");
    expect(result.restoredCount).toBe(3);
  });

  it("handles empty item list gracefully", async () => {
    const port = makeRestorePort();
    const uc = new ApplyRecoveryRestoreUseCase(port);

    const result = await uc.execute({ recoveryPointId: "rp-1", items: [] });

    expect(port.restoreObject).not.toHaveBeenCalled();
    expect(result.restoredCount).toBe(0);
  });

  it("is idempotent: re-running with same items does not throw", async () => {
    const port = makeRestorePort();
    const uc = new ApplyRecoveryRestoreUseCase(port);
    const items = makeItems(2);

    await uc.execute({ recoveryPointId: "rp-1", items });
    const result2 = await uc.execute({ recoveryPointId: "rp-1", items });

    expect(result2.restoredCount).toBe(2);
  });
});
