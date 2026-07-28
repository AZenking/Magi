/**
 * Channel lifecycle HTTP contract tests (T051/T057).
 *
 * Exercises the T057 controller surface directly (no HTTP server): lifecycle
 * filter passthrough, If-Match handling on transitions, lifecycle-counts and
 * purge preview (contracts/channels.md).
 */
import { describe, it, expect } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { OutputController } from "../output.controller";
import { ChangeChannelLifecycleUseCase } from "../../../application/output-composition/change-channel-lifecycle.use-case";
import { PurgeChannelUseCase } from "../../../application/output-composition/purge-channel.use-case";
import { parseIfMatch, etagFor } from "../../../shared/http/precondition";
import type { CanonicalChannel, ICanonicalChannelRepository } from "../../../domain/output-composition";

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

function makeFakeRepo(channels: CanonicalChannel[]) {
  const store = new Map(channels.map((c) => [c.id, { ...c }]));
  return {
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
      let n = 0;
      for (const id of ids) if (store.delete(id)) n++;
      return n;
    },
  } as unknown as ICanonicalChannelRepository;
}

/** Build a controller with only the lifecycle-relevant collaborators wired. */
function makeController(opts: {
  channels?: CanonicalChannel[];
  findChannels?: Partial<{ execute: (q: unknown) => Promise<{ items: CanonicalChannel[]; total: number }>; countByLifecycle: () => Promise<Record<string, number>> }>;
}) {
  const repo = makeFakeRepo(opts.channels ?? [makeChannel()]);
  const findChannels = {
    execute: async () => ({ items: opts.channels ?? [makeChannel()], total: (opts.channels ?? [makeChannel()]).length }),
    countByLifecycle: async () => ({ active: 1, hidden: 0, disabled: 0, trashed: 0 }),
    ...opts.findChannels,
  };
  const none = null as never;
  return new OutputController(
    findChannels as never,
    none, // generateM3u
    none, // generateXmltv
    none, // generateM3uV2
    none, // generateXmltvV2
    none, // findOutputGuide
    {
      findByCanonicalChannelIds: async () => new Map(),
      findByCanonicalChannelId: async () => null,
    } as never, // epgBindingRepo
    none, // updateChannel
    none, // findDetail
    new ChangeChannelLifecycleUseCase(repo),
    new PurgeChannelUseCase(repo),
    none, // updateEpgBinding (T069)
    none, // reorderStreams (T116)
    none, // failoverPolicy (T116)
    none, // checkStream (T116)
    none, // findStreamsUc
    none, // createStreamUc
    none, // updateStreamUc
    none, // deleteStreamUc
    none, // setPrimaryStreamUc
    none, // enqueueSync
    none, // logoUpload
  );
}

describe("Channel lifecycle HTTP contract (T051/T057)", () => {
  it("GET /output/channels?lifecycle=hidden filters by lifecycle, not legacy booleans", async () => {
    let captured: Record<string, unknown> = {};
    const hidden = makeChannel({ id: "ch-h", lifecycle: "hidden", hidden: true });
    const controller = makeController({
      channels: [hidden],
      findChannels: {
        execute: async (q) => {
          captured = q as Record<string, unknown>;
          return { items: [hidden], total: 1 };
        },
      },
    });

    const res = await controller.listChannels({ lifecycle: "hidden" });

    expect(captured.lifecycle).toBe("hidden");
    expect(captured.hidden).toBeUndefined();
    expect(captured.disabled).toBeUndefined();
    expect(res.success).toBe(true);
    expect(res.data.items[0]!.lifecycle).toBe("hidden");
    expect(res.data.items[0]!.version).toBe(1);
  });

  it("GET /output/channels without lifecycle keeps the legacy active default", async () => {
    let captured: Record<string, unknown> = {};
    const controller = makeController({
      findChannels: {
        execute: async (q) => {
          captured = q as Record<string, unknown>;
          return { items: [], total: 0 };
        },
      },
    });

    await controller.listChannels({});

    expect(captured.lifecycle).toBeUndefined();
    expect(captured.hidden).toBe(false);
    expect(captured.disabled).toBe(false);
  });

  it("GET /output/channels/lifecycle-counts returns per-state counts", async () => {
    const controller = makeController({
      findChannels: { countByLifecycle: async () => ({ active: 5, hidden: 2, disabled: 1, trashed: 3 }) },
    });

    const res = await controller.lifecycleCounts();

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ active: 5, hidden: 2, disabled: 1, trashed: 3 });
  });

  it("POST lifecycle without a parseable If-Match returns 400 (guard yields 428 upstream)", async () => {
    const controller = makeController({});

    // The IfMatchRequiredGuard rejects a missing header with 428 before the
    // handler runs; the handler itself rejects malformed values with 400.
    expect(parseIfMatch(null)).toBeNull();
    expect(parseIfMatch("not-a-version")).toBeNull();
    await expect(
      controller.changeChannelLifecycle("ch-1", { target: "hidden" }, "not-a-version"),
    ).rejects.toThrow(BadRequestException);
  });

  it("POST lifecycle with stale If-Match returns 412 stale-resource", async () => {
    const controller = makeController({ channels: [makeChannel({ version: 3 })] });

    await expect(
      controller.changeChannelLifecycle("ch-1", { target: "hidden" }, etagFor(1)),
    ).rejects.toThrow(ConflictException);
  });

  it("POST lifecycle with matching If-Match transitions and returns the new version", async () => {
    const controller = makeController({ channels: [makeChannel({ version: 3 })] });

    const res = await controller.changeChannelLifecycle("ch-1", { target: "trashed", reason: "cleanup" }, etagFor(3));

    expect(res.success).toBe(true);
    expect(res.data!.previous).toBe("active");
    expect(res.data!.current).toBe("trashed");
    expect(res.data!.version).toBe(4);
    expect(res.data!.purgeAfter).not.toBeNull();
  });

  it("purge preview names every unrecoverable relationship", async () => {
    const controller = makeController({
      channels: [makeChannel({ lifecycle: "trashed", trashedAt: new Date(), purgeAfter: new Date(Date.now() - 1000) })],
    });

    const res = await controller.purgePreview("ch-1");

    expect(res.success).toBe(true);
    expect(res.data!.canPurge).toBe(true);
    expect(res.data!.unrecoverableRelationships.length).toBeGreaterThanOrEqual(4);
  });
});
