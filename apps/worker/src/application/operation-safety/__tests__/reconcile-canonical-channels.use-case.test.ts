/**
 * ReconcileCanonicalChannelsUseCase unit tests (009-m3u-control-plane T021).
 *
 * Locks down the 009 reconcile contract with mocked repositories (no DB):
 *   - Same non-null normalized tvg-id → auto-merge into one canonical
 *   - Empty tvg-id never auto-merges; emits weak-match candidates instead
 *   - Rejected candidates suppress the same pairing on subsequent runs
 *   - Missing source channels deactivate their membership
 */
import { describe, it, expect, vi } from "vitest";
import { ReconcileCanonicalChannelsUseCase } from "../reconcile-canonical-channels.use-case";
import type { ICanonicalReconcileRepository } from "@/domain/source-sync/canonical-reconcile.repository";

function makeRepo(): ICanonicalReconcileRepository & {
  findCanonicalByNormalizedTvgId: ReturnType<typeof vi.fn>;
  insertWeakMatchCandidate: ReturnType<typeof vi.fn>;
  isCandidateSuppressed: ReturnType<typeof vi.fn>;
  listCanonicalsForWeakMatch: ReturnType<typeof vi.fn>;
  findMembership: ReturnType<typeof vi.fn>;
  upsertMembership: ReturnType<typeof vi.fn>;
  createCanonicalFromSource: ReturnType<typeof vi.fn>;
  deactivateMembership: ReturnType<typeof vi.fn>;
} {
  return {
    findMembership: vi.fn().mockResolvedValue(null),
    upsertMembership: vi.fn().mockResolvedValue(undefined),
    createCanonicalFromSource: vi.fn().mockResolvedValue({
      canonicalChannelId: "canon-new",
    }),
    deactivateMembership: vi.fn().mockResolvedValue(undefined),
    findCanonicalByNormalizedTvgId: vi.fn().mockResolvedValue(null),
    insertWeakMatchCandidate: vi.fn().mockResolvedValue(undefined),
    isCandidateSuppressed: vi.fn().mockResolvedValue(false),
    listCanonicalsForWeakMatch: vi.fn().mockResolvedValue([
      {
        canonicalChannelId: "canon-existing-1",
        normalizedName: "凤凰资讯",
        normalizedGroup: "资讯",
        memberSourceChannelIds: ["src-ch-existing"],
      },
    ]),
  } as never;
}

describe("ReconcileCanonicalChannelsUseCase 009 (T021)", () => {
  it("auto-merges source channels with the same non-null normalized tvg-id", async () => {
    const repo = makeRepo();
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      missingSourceChannelIds: [],
      sourceChannels: [
        {
          sourceChannelId: "src-ch-a",
          channelIdentity: "cctv-1@src-1",
          displayName: "CCTV-1 综合",
          groupTitle: "综合",
          tvgId: "CCTV-1",
          normalizedName: "cctv-1 综合",
          normalizedGroup: "综合",
          streamUrl: "http://a.ts",
          sourceFingerprint: "fp-a",
        },
        {
          sourceChannelId: "src-ch-b",
          channelIdentity: "cctv-1@src-2",
          displayName: "CCTV-1 HD",
          groupTitle: "综合",
          tvgId: "cctv-1", // case-insensitive normalize → same key
          normalizedName: "cctv-1 hd",
          normalizedGroup: "综合",
          streamUrl: "http://b.ts",
          sourceFingerprint: "fp-b",
        },
      ],
    });

    // Both channels joined the same NEW canonical (no existing match).
    expect(repo.createCanonicalFromSource).toHaveBeenCalledOnce();
    expect(repo.upsertMembership).toHaveBeenCalledTimes(2);
    expect(repo.upsertMembership).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sourceChannelId: "src-ch-a" }),
      "automatic",
    );
    expect(repo.upsertMembership).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sourceChannelId: "src-ch-b" }),
      "automatic",
    );
    expect(result.linkedCount).toBe(2);
    expect(result.createdCount).toBe(1);
  });

  it("joins an existing canonical when normalized tvg-id already exists", async () => {
    const repo = makeRepo();
    repo.findCanonicalByNormalizedTvgId.mockResolvedValueOnce({
      canonicalChannelId: "canon-existing",
    });
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      missingSourceChannelIds: [],
      sourceChannels: [
        {
          sourceChannelId: "src-ch-c",
          channelIdentity: "cctv-1@src-3",
          displayName: "CCTV-1",
          groupTitle: "综合",
          tvgId: "CCTV-1",
          normalizedName: "cctv-1",
          normalizedGroup: "综合",
          streamUrl: "http://c.ts",
          sourceFingerprint: "fp-c",
        },
      ],
    });

    expect(repo.createCanonicalFromSource).not.toHaveBeenCalled();
    expect(repo.upsertMembership).toHaveBeenCalledWith(
      "canon-existing",
      expect.objectContaining({ sourceChannelId: "src-ch-c" }),
      "automatic",
    );
    expect(result.linkedCount).toBe(1);
    expect(result.createdCount).toBe(0);
  });

  it("does NOT auto-merge when tvg-id is empty (emits weak-match candidate)", async () => {
    const repo = makeRepo();
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      missingSourceChannelIds: [],
      sourceChannels: [
        {
          sourceChannelId: "src-ch-d",
          channelIdentity: "phoenix-a",
          displayName: "凤凰资讯",
          groupTitle: "资讯",
          tvgId: null, // empty → no auto-merge
          normalizedName: "凤凰资讯",
          normalizedGroup: "资讯",
          streamUrl: "http://d.ts",
          sourceFingerprint: "fp-d",
        },
      ],
    });

    expect(repo.createCanonicalFromSource).not.toHaveBeenCalled();
    expect(repo.upsertMembership).not.toHaveBeenCalled();
    // The candidate was emitted against the existing 凤凰资讯 canonical.
    expect(repo.insertWeakMatchCandidate).toHaveBeenCalledOnce();
    expect(repo.insertWeakMatchCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChannelId: "src-ch-d",
        canonicalChannelId: "canon-existing-1",
        method: "normalized_name_group",
      }),
    );
    expect(result.candidatesEmitted).toBe(1);
  });

  it("suppresses a candidate when the same pairing was previously rejected", async () => {
    const repo = makeRepo();
    repo.isCandidateSuppressed.mockResolvedValue(true);
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      missingSourceChannelIds: [],
      sourceChannels: [
        {
          sourceChannelId: "src-ch-e",
          channelIdentity: "phoenix-b",
          displayName: "凤凰资讯",
          groupTitle: "资讯",
          tvgId: null,
          normalizedName: "凤凰资讯",
          normalizedGroup: "资讯",
          streamUrl: "http://e.ts",
          sourceFingerprint: "fp-e",
        },
      ],
    });

    expect(repo.insertWeakMatchCandidate).not.toHaveBeenCalled();
    expect(result.candidatesEmitted).toBe(0);
    expect(result.candidatesSuppressed).toBe(1);
  });

  it("deactivates membership for source channels that went missing", async () => {
    const repo = makeRepo();
    repo.findMembership.mockResolvedValueOnce({
      canonicalChannelId: "canon-x",
    });
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    const result = await uc.execute({
      sourceId: "src-1",
      sourceChannels: [],
      missingSourceChannelIds: ["src-ch-gone"],
    });

    expect(repo.deactivateMembership).toHaveBeenCalledWith("canon-x", "src-ch-gone");
    expect(result.deactivatedCount).toBe(1);
  });

  it("does not call insertWeakMatchCandidate when no unmatched sources remain", async () => {
    const repo = makeRepo();
    const uc = new ReconcileCanonicalChannelsUseCase(repo);

    await uc.execute({
      sourceId: "src-1",
      missingSourceChannelIds: [],
      sourceChannels: [
        {
          sourceChannelId: "src-ch-f",
          channelIdentity: "cctv-2",
          displayName: "CCTV-2",
          groupTitle: "综合",
          tvgId: "CCTV-2",
          normalizedName: "cctv-2",
          normalizedGroup: "综合",
          streamUrl: "http://f.ts",
          sourceFingerprint: "fp-f",
        },
      ],
    });

    expect(repo.insertWeakMatchCandidate).not.toHaveBeenCalled();
    expect(repo.listCanonicalsForWeakMatch).not.toHaveBeenCalled();
  });
});
