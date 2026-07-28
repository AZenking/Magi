/**
 * Channel lifecycle use-case tests (T050).
 *
 * Verifies single-transition, batch-lifecycle preview, trash-restore and purge
 * use cases (T055) against an in-memory fake repository.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { CanonicalChannel, ICanonicalChannelRepository } from "../../../domain/output-composition";
import { ChangeChannelLifecycleUseCase } from "../change-channel-lifecycle.use-case";
import { PrepareBatchLifecycleUseCase } from "../prepare-batch-lifecycle.use-case";
import { RestoreTrashedChannelUseCase } from "../restore-trashed-channel.use-case";
import { PurgeChannelUseCase } from "../purge-channel.use-case";

const DAY = 24 * 60 * 60 * 1000;

function makeChannel(overrides: Partial<CanonicalChannel> = {}): CanonicalChannel {
  return {
    id: "ch-1",
    standardName: "CCTV-1",
    standardGroup: "央视",
    standardLogo: null,
    channelNumber: 1,
    hidden: false,
    starred: false,
    disabled: false,
    epgChannelId: null,
    epgMatchType: null,
    epgStatus: null,
    outputStatus: "active",
    qualityScore: null,
    primaryStreamId: null,
    mergedFromIds: null,
    mergeMethod: null,
    conflictNote: null,
    lastMergedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lifecycle: "active",
    lifecycleReason: null,
    trashedAt: null,
    purgeAfter: null,
    stableKey: null,
    version: 1,
    ...overrides,
  };
}

/** In-memory fake covering only the members the lifecycle use cases touch. */
function makeFakeRepo(channels: CanonicalChannel[]) {
  const store = new Map(channels.map((c) => [c.id, { ...c }]));
  const repo = {
    async findById(id: string) {
      return store.get(id) ?? null;
    },
    async updateIfVersion(id: string, data: Partial<CanonicalChannel>, expectedVersion: number) {
      const current = store.get(id);
      if (!current || (current.version ?? 1) !== expectedVersion) return null;
      const next = { ...current, ...data, version: expectedVersion + 1, updatedAt: new Date() };
      store.set(id, next);
      return next;
    },
    async batchDelete(ids: string[]) {
      let deleted = 0;
      for (const id of ids) if (store.delete(id)) deleted++;
      return deleted;
    },
  } as unknown as ICanonicalChannelRepository;
  return { repo, store };
}

describe("Channel lifecycle use cases (T050/T055)", () => {
  let channel: CanonicalChannel;

  beforeEach(() => {
    channel = makeChannel();
  });

  it("single transition active→hidden updates lifecycle and bumps version", async () => {
    const { repo, store } = makeFakeRepo([channel]);
    const useCase = new ChangeChannelLifecycleUseCase(repo);

    const result = await useCase.execute({ channelId: "ch-1", target: "hidden", expectedVersion: 1 });

    expect(result.previous).toBe("active");
    expect(result.lifecycle).toBe("hidden");
    expect(result.version).toBe(2);
    const saved = store.get("ch-1")!;
    expect(saved.lifecycle).toBe("hidden");
    expect(saved.hidden).toBe(true);
  });

  it("stale expectedVersion is rejected with 412 stale-resource", async () => {
    const { repo } = makeFakeRepo([channel]);
    const useCase = new ChangeChannelLifecycleUseCase(repo);

    await expect(
      useCase.execute({ channelId: "ch-1", target: "hidden", expectedVersion: 99 }),
    ).rejects.toThrow(ConflictException);
  });

  it("trashing sets trashedAt and purgeAfter ≈ now + 30d", async () => {
    const { repo, store } = makeFakeRepo([channel]);
    const useCase = new ChangeChannelLifecycleUseCase(repo);

    const result = await useCase.execute({ channelId: "ch-1", target: "trashed", expectedVersion: 1 });

    expect(result.purgeAfter).not.toBeNull();
    const delta = result.purgeAfter!.getTime() - Date.now();
    expect(delta).toBeGreaterThan(29 * DAY);
    expect(delta).toBeLessThanOrEqual(30 * DAY);
    expect(store.get("ch-1")!.trashedAt).toBeInstanceOf(Date);
  });

  it("batch lifecycle preview lists stable IDs + names + current/target state", async () => {
    const { repo } = makeFakeRepo([
      channel,
      makeChannel({ id: "ch-2", standardName: "CCTV-2", lifecycle: "hidden" }),
    ]);
    const useCase = new PrepareBatchLifecycleUseCase(repo);

    const result = await useCase.execute({ channelIds: ["ch-1", "ch-2", "ch-missing"], target: "disabled" });

    expect(result.count).toBe(2);
    expect(result.items).toEqual([
      { channelId: "ch-1", standardName: "CCTV-1", currentLifecycle: "active", targetLifecycle: "disabled" },
      { channelId: "ch-2", standardName: "CCTV-2", currentLifecycle: "hidden", targetLifecycle: "disabled" },
    ]);
  });

  it("trash restore returns a channel to its pre-trash state and clears trash fields", async () => {
    const trashed = makeChannel({
      lifecycle: "trashed",
      trashedAt: new Date(),
      purgeAfter: new Date(Date.now() + 30 * DAY),
      version: 3,
    });
    const { repo, store } = makeFakeRepo([trashed]);
    const useCase = new RestoreTrashedChannelUseCase(repo);

    const result = await useCase.execute({ channelId: "ch-1", target: "active", expectedVersion: 3 });

    expect(result.lifecycle).toBe("active");
    const saved = store.get("ch-1")!;
    expect(saved.trashedAt).toBeNull();
    expect(saved.purgeAfter).toBeNull();
    expect(saved.hidden).toBe(false);
    expect(saved.disabled).toBe(false);
  });

  it("restore target cannot be trashed", async () => {
    const { repo } = makeFakeRepo([channel]);
    const useCase = new RestoreTrashedChannelUseCase(repo);

    await expect(
      useCase.execute({ channelId: "ch-1", target: "trashed", expectedVersion: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it("purge preview reports every unrecoverable relationship", async () => {
    const { repo } = makeFakeRepo([
      makeChannel({ lifecycle: "trashed", trashedAt: new Date(), purgeAfter: new Date(Date.now() - DAY) }),
    ]);
    const useCase = new PurgeChannelUseCase(repo);

    const preview = await useCase.preview({ channelId: "ch-1" });

    expect(preview.canPurge).toBe(true);
    expect(preview.standardName).toBe("CCTV-1");
    expect(preview.unrecoverableRelationships.length).toBeGreaterThanOrEqual(4);
  });

  it("purge apply refuses a channel whose purgeAfter has not elapsed", async () => {
    const { repo, store } = makeFakeRepo([
      makeChannel({ lifecycle: "trashed", trashedAt: new Date(), purgeAfter: new Date(Date.now() + DAY) }),
    ]);
    const useCase = new PurgeChannelUseCase(repo);

    await expect(useCase.apply("ch-1")).rejects.toThrow(ConflictException);
    expect(store.has("ch-1")).toBe(true);
  });

  it("purge apply hard-deletes an eligible channel", async () => {
    const { repo, store } = makeFakeRepo([
      makeChannel({ lifecycle: "trashed", trashedAt: new Date(), purgeAfter: new Date(Date.now() - DAY) }),
    ]);
    const useCase = new PurgeChannelUseCase(repo);

    const result = await useCase.apply("ch-1");

    expect(result.purged).toBe(true);
    expect(store.has("ch-1")).toBe(false);
  });

  it("illegal transition is rejected", async () => {
    const { repo } = makeFakeRepo([channel]);
    const useCase = new ChangeChannelLifecycleUseCase(repo);

    // active→active is not a transition (contracts/channels.md).
    await expect(
      useCase.execute({ channelId: "ch-1", target: "active", expectedVersion: 1 }),
    ).rejects.toThrow(ConflictException);
  });
});
