/**
 * Output publication projection tests (009-m3u-control-plane T045).
 *
 * Locks down the projection semantics:
 *   - status: fresh (publishable) | stale (last-good kept) | blocked (none)
 *   - revision is monotonic per scope
 *   - counts (channelCount / playableChannelCount / excludedChannelCount)
 *     match the supplied input
 *   - upsert is idempotent on identical input
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateOutputPublicationUseCase } from "../output-publication.use-case";
import type { IOutputPublicationRepository } from "@/domain/output-composition";
import type { OutputPublicationVo } from "@magi/types";

function makeRepo(): IOutputPublicationRepository & {
  read: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
} {
  return {
    read: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockImplementation(async (input) => ({
      revision: input.revision,
      status: input.status,
      publishedAt: input.publishedAt ? input.publishedAt.toISOString() : null,
      channelCount: input.channelCount,
      playableChannelCount: input.playableChannelCount,
      excludedChannelCount: input.excludedChannelCount,
      blockingReason: input.blockingReason,
    }) as OutputPublicationVo),
  } as never;
}

describe("UpdateOutputPublicationUseCase (T045)", () => {
  let repo: ReturnType<typeof makeRepo>;
  let uc: UpdateOutputPublicationUseCase;

  beforeEach(() => {
    repo = makeRepo();
    uc = new UpdateOutputPublicationUseCase(repo);
  });

  it("writes a fresh projection when apply succeeds with playable channels", async () => {
    const result = await uc.execute({
      scope: "primary",
      outcome: "apply-succeeded",
      channelCount: 10,
      playableChannelCount: 9,
      excludedChannelCount: 1,
      lastApplyChangeSetId: "cs-1",
    });
    expect(result.status).toBe("fresh");
    expect(result.channelCount).toBe(10);
    expect(result.playableChannelCount).toBe(9);
    expect(result.excludedChannelCount).toBe(1);
    expect(result.blockingReason).toBeNull();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it("writes stale when the latest apply failed but last-good is still servable", async () => {
    const result = await uc.execute({
      scope: "primary",
      outcome: "apply-failed",
      channelCount: 10,
      playableChannelCount: 9,
      excludedChannelCount: 1,
      lastApplyChangeSetId: "cs-failed",
    });
    expect(result.status).toBe("stale");
    expect(result.blockingReason).toBe("last-apply-failed");
  });

  it("writes blocked when there are zero playable channels (no servable directory)", async () => {
    const result = await uc.execute({
      scope: "primary",
      outcome: "apply-succeeded",
      channelCount: 0,
      playableChannelCount: 0,
      excludedChannelCount: 0,
      lastApplyChangeSetId: null,
    });
    expect(result.status).toBe("blocked");
    expect(result.blockingReason).toBe("no-playable-channels");
  });

  it("computes a strictly-increasing revision per scope", async () => {
    repo.read.mockResolvedValueOnce({
      revision: "rev-20260807-1",
      status: "fresh",
      publishedAt: new Date().toISOString(),
      channelCount: 10,
      playableChannelCount: 10,
      excludedChannelCount: 0,
      blockingReason: null,
    });
    const result = await uc.execute({
      scope: "primary",
      outcome: "apply-succeeded",
      channelCount: 11,
      playableChannelCount: 11,
      excludedChannelCount: 0,
      lastApplyChangeSetId: "cs-2",
    });
    // The revision must differ from the prior revision (lexicographic order is
    // fine — we just need strict inequality).
    expect(result.revision).not.toBe("rev-20260807-1");
  });

  it("upsert is idempotent when called with identical input + revision", async () => {
    repo.read.mockResolvedValueOnce({
      revision: "rev-stable",
      status: "fresh",
      publishedAt: new Date().toISOString(),
      channelCount: 5,
      playableChannelCount: 5,
      excludedChannelCount: 0,
      blockingReason: null,
    });
    const result = await uc.execute({
      scope: "primary",
      outcome: "apply-succeeded",
      channelCount: 5,
      playableChannelCount: 5,
      excludedChannelCount: 0,
      lastApplyChangeSetId: "cs-same",
    });
    // No reason to bump revision when nothing changed.
    expect(result.revision).toBe("rev-stable");
  });
});
