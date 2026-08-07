/**
 * Merge candidate use-case tests (009-m3u-control-plane T022/T026).
 *
 * Unit tests for ListMergeCandidatesUseCase + ReviewMergeCandidateUseCase.
 * Uses mock repositories so it runs without Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ListMergeCandidatesUseCase,
  ReviewMergeCandidateUseCase,
  MergeCandidateNotFoundError,
  MergeCandidateNotPendingError,
  MergeCandidateValidationError,
  type IManualMembershipWriter,
} from "../merge-candidate.use-cases";
import type { IMergeCandidateRepository } from "@/domain/output-composition";
import type { MergeCandidateVo } from "@magi/types";

function makeCandidate(overrides: Partial<MergeCandidateVo> = {}): MergeCandidateVo {
  return {
    id: "mc-1",
    sourceChannelId: "src-ch-1",
    canonicalChannelId: "canon-1",
    method: "normalized_name",
    reasons: ["display-name-match"],
    status: "pending",
    sourceFingerprint: "fp-1",
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

function makeRepo(initial: MergeCandidateVo[] = []) {
  const store = new Map<string, MergeCandidateVo>(initial.map((c) => [c.id, c]));
  return {
    list: vi.fn(async (filters: { status?: string }, params: { page: number; pageSize: number }) => {
      const items = [...store.values()].filter((c) =>
        !filters.status || c.status === filters.status,
      );
      return {
        items,
        total: items.length,
        params,
      };
    }),
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    create: vi.fn(async (data: {
      sourceChannelId: string;
      method: "normalized_name" | "normalized_name_group";
      reasons: readonly string[];
      sourceFingerprint: string;
      suppressionKey: string | null;
      confidence: number;
    }) => {
      const c = makeCandidate({
        id: `mc-${store.size + 1}`,
        sourceChannelId: data.sourceChannelId,
        method: data.method,
        reasons: [...data.reasons],
        sourceFingerprint: data.sourceFingerprint,
      });
      store.set(c.id, c);
      return c;
    }),
    markAccepted: vi.fn(async (id: string, reviewedBy: string, note?: string) => {
      const cur = store.get(id);
      if (!cur) return null;
      const next = {
        ...cur,
        status: "accepted" as const,
        reviewedAt: new Date().toISOString(),
        reviewedBy,
      };
      store.set(id, next);
      void note;
      return next;
    }),
    markRejected: vi.fn(async (id: string, reviewedBy: string, note?: string) => {
      const cur = store.get(id);
      if (!cur) return null;
      const next = {
        ...cur,
        status: "rejected" as const,
        reviewedAt: new Date().toISOString(),
        reviewedBy,
      };
      store.set(id, next);
      void note;
      return next;
    }),
    markStale: vi.fn(async (ids: readonly string[]) => {
      for (const id of ids) {
        const cur = store.get(id);
        if (cur && cur.status === "pending") {
          store.set(id, { ...cur, status: "stale" as const });
        }
      }
      return ids.length;
    }),
    isSuppressed: vi.fn().mockResolvedValue(false),
    _store: store,
  } as unknown as IMergeCandidateRepository & { _store: Map<string, MergeCandidateVo> };
}

function makeManualWriter() {
  return {
    upsertManualMembership: vi.fn().mockResolvedValue(undefined),
  } as unknown as IManualMembershipWriter & {
    upsertManualMembership: ReturnType<typeof vi.fn>;
  };
}

describe("ListMergeCandidatesUseCase (T022)", () => {
  it("returns paginated candidates filtered by status", async () => {
    const repo = makeRepo([
      makeCandidate({ id: "m1", status: "pending" }),
      makeCandidate({ id: "m2", status: "accepted" }),
      makeCandidate({ id: "m3", status: "pending" }),
    ]);
    const uc = new ListMergeCandidatesUseCase(repo);

    const result = await uc.execute({
      filters: { status: "pending" },
      page: 1,
      pageSize: 10,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items.every((c) => c.status === "pending")).toBe(true);
  });

  it("uses default page=1 / pageSize=20 when omitted", async () => {
    const repo = makeRepo([makeCandidate()]);
    const uc = new ListMergeCandidatesUseCase(repo);

    const result = await uc.execute({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});

describe("ReviewMergeCandidateUseCase (T022)", () => {
  let repo: IMergeCandidateRepository & { _store: Map<string, MergeCandidateVo> };
  let writer: IManualMembershipWriter & {
    upsertManualMembership: ReturnType<typeof vi.fn>;
  };
  let uc: ReviewMergeCandidateUseCase;

  beforeEach(() => {
    repo = makeRepo([makeCandidate({ id: "mc-1", status: "pending" })]);
    writer = makeManualWriter();
    uc = new ReviewMergeCandidateUseCase(repo, writer);
  });

  it("accept creates a manual membership + marks candidate accepted", async () => {
    const result = await uc.execute({
      id: "mc-1",
      decision: "accept",
      reviewedBy: "user-1",
    });

    expect(writer.upsertManualMembership).toHaveBeenCalledWith(
      "canon-1",
      "src-ch-1",
      "",
    );
    expect(result.membershipCreated).toBe(true);
    expect(result.candidate.status).toBe("accepted");
    expect(result.candidate.reviewedBy).toBe("user-1");
  });

  it("reject marks candidate rejected (no membership write)", async () => {
    const result = await uc.execute({
      id: "mc-1",
      decision: "reject",
      reviewedBy: "user-1",
      reason: "wrong channel",
    });

    expect(writer.upsertManualMembership).not.toHaveBeenCalled();
    expect(result.membershipCreated).toBe(false);
    expect(result.candidate.status).toBe("rejected");
    expect(result.candidate.reviewedBy).toBe("user-1");
  });

  it("throws MergeCandidateNotFoundError for unknown id", async () => {
    await expect(
      uc.execute({ id: "nope", decision: "accept", reviewedBy: "u" }),
    ).rejects.toBeInstanceOf(MergeCandidateNotFoundError);
  });

  it("throws MergeCandidateNotPendingError when already decided", async () => {
    repo._store.set("mc-1", makeCandidate({ id: "mc-1", status: "accepted" }));
    await expect(
      uc.execute({ id: "mc-1", decision: "accept", reviewedBy: "u" }),
    ).rejects.toBeInstanceOf(MergeCandidateNotPendingError);
  });

  it("throws MergeCandidateValidationError on accept without canonical", async () => {
    repo._store.set(
      "mc-1",
      makeCandidate({ id: "mc-1", status: "pending", canonicalChannelId: null }),
    );
    await expect(
      uc.execute({ id: "mc-1", decision: "accept", reviewedBy: "u" }),
    ).rejects.toBeInstanceOf(MergeCandidateValidationError);
  });
});
