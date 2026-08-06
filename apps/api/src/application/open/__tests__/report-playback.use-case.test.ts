/**
 * ReportPlaybackUseCase tests (008-pipeline-reliability T031, US3).
 *
 * Validates that playback reports correctly update stream health metrics:
 * failure increments consecutiveFailures and degrades/offlines the stream;
 * success resets to 0 and onlines the stream. Also verifies dedup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportPlaybackUseCase } from "../report-playback.use-case";
import type { ChannelStream } from "@/domain/output-composition";

function makeStream(overrides: Partial<ChannelStream> = {}): ChannelStream {
  return {
    id: "stream-1",
    canonicalChannelId: "magi:ch-1",
    m3uSourceId: null,
    rawChannelId: null,
    sourceChannelId: null,
    streamUrl: "http://test.ts",
    isPrimary: true,
    healthStatus: "online",
    responseTime: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    successRate: null,
    streamError: null,
    streamCodec: null,
    streamFormat: null,
    streamWidth: null,
    streamHeight: null,
    streamFrameRate: null,
    streamBitrate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(stream: ChannelStream | null) {
  return {
    findById: vi.fn().mockResolvedValue(stream),
    update: vi.fn().mockResolvedValue(stream),
    findByCanonicalChannelId: vi.fn().mockResolvedValue(stream ? [stream] : []),
    findByCanonicalChannelIdWithSource: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    createBatch: vi.fn(),
    deleteById: vi.fn(),
    deleteByCanonicalChannelId: vi.fn(),
    findOrderedByCanonicalChannelId: vi.fn().mockResolvedValue(stream ? [stream] : []),
    reorder: vi.fn(),
  };
}

describe("ReportPlaybackUseCase (T031)", () => {
  let testTime = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    // Each test gets a unique time to avoid cross-test dedup collisions
    // (recentFailures is module-scoped, not instance-scoped).
    testTime += 100_000;
    vi.setSystemTime(new Date(1700000000000 + testTime));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments consecutiveFailures and sets degraded on first failure", async () => {
    const stream = makeStream({ consecutiveFailures: 0, healthStatus: "online" });
    const repo = makeRepo(stream);
    const uc = new ReportPlaybackUseCase(repo as never, { evaluate: vi.fn().mockResolvedValue({ targetStreamId: null }) } as never);

    const result = await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "failure",
      error_kind: "network",
      played_duration_ms: 2000,
      deviceClientId: "device-1",
    });

    expect(result).toEqual({ accepted: true });
    expect(repo.update).toHaveBeenCalledWith(
      "stream-1",
      expect.objectContaining({
        consecutiveFailures: 1,
        healthStatus: "degraded",
        streamError: "network",
      }),
    );
  });

  it("sets offline when consecutiveFailures reaches 3", async () => {
    const stream = makeStream({ consecutiveFailures: 2, healthStatus: "degraded" });
    const repo = makeRepo(stream);
    const uc = new ReportPlaybackUseCase(repo as never, { evaluate: vi.fn().mockResolvedValue({ targetStreamId: null }) } as never);

    await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "failure",
      error_kind: "http",
      played_duration_ms: 0,
      deviceClientId: "device-1",
    });

    expect(repo.update).toHaveBeenCalledWith(
      "stream-1",
      expect.objectContaining({
        consecutiveFailures: 3,
        healthStatus: "offline",
      }),
    );
  });

  it("resets consecutiveFailures to 0 and sets online on success", async () => {
    const stream = makeStream({ consecutiveFailures: 2, healthStatus: "degraded" });
    const repo = makeRepo(stream);
    const uc = new ReportPlaybackUseCase(repo as never, { evaluate: vi.fn().mockResolvedValue({ targetStreamId: null }) } as never);

    await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "success",
      error_kind: null,
      played_duration_ms: 1500,
      deviceClientId: "device-1",
    });

    expect(repo.update).toHaveBeenCalledWith(
      "stream-1",
      expect.objectContaining({
        consecutiveFailures: 0,
        healthStatus: "online",
        streamError: null,
      }),
    );
  });

  it("safely ignores when stream does not exist", async () => {
    const repo = makeRepo(null);
    const uc = new ReportPlaybackUseCase(repo as never, { evaluate: vi.fn().mockResolvedValue({ targetStreamId: null }) } as never);

    const result = await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "missing-stream",
      outcome: "failure",
      error_kind: "network",
      played_duration_ms: 0,
      deviceClientId: "device-1",
    });

    expect(result).toEqual({ accepted: true });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("deduplicates rapid failure reports within 10s window", async () => {
    const stream = makeStream({ consecutiveFailures: 0 });
    const repo = makeRepo(stream);
    const uc = new ReportPlaybackUseCase(repo as never, { evaluate: vi.fn().mockResolvedValue({ targetStreamId: null }) } as never);

    // First failure — processed.
    await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "failure",
      error_kind: "network",
      played_duration_ms: 0,
      deviceClientId: "device-1",
    });
    expect(repo.update).toHaveBeenCalledTimes(1);

    // Second failure within 10s — deduplicated.
    await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "failure",
      error_kind: "network",
      played_duration_ms: 0,
      deviceClientId: "device-1",
    });
    expect(repo.update).toHaveBeenCalledTimes(1); // still 1, not 2

    // After 10s — processed again.
    vi.advanceTimersByTime(11_000);
    await uc.execute({
      channel_id: "magi:ch-1",
      stream_id: "stream-1",
      outcome: "failure",
      error_kind: "network",
      played_duration_ms: 0,
      deviceClientId: "device-1",
    });
    expect(repo.update).toHaveBeenCalledTimes(2);
  });
});

import { afterEach } from "vitest";
