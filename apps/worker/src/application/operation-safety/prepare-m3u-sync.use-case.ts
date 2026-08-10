/**
 * PrepareM3uSyncUseCase (T037; 009-m3u-control-plane T015 extends it with
 * idempotent snapshot staging, sourceVersion capture, anomaly classification
 * and explicit requiresConfirmation flag).
 *
 * Worker-side preview preparation for M3U sync. Downloads, parses, stages an
 * immutable snapshot (idempotent on (sourceId, fingerprint)), computes the
 * stable diff against current PRESENT channels, runs the pure anomaly
 * classifier (empty-snapshot / ≥25% deletion), and returns the change-set
 * summary + confirmation requirement.
 *
 * Side-effect free on current output: no stableUpsert, no markMissing, no
 * applyAtomic. The change set row is updated by the caller (operation-worker)
 * with the returned summary/warnings/requiresConfirmation.
 *
 * Depends only on domain ports + backend-core pure algorithms (constitution III).
 */
import {
  downloadSource,
  parseM3U,
  generateChannelIdentity,
  computeFingerprint,
  computeChangeItems,
  summarize,
  classifyAnomaly,
  type SnapshotItem,
} from "@magi/backend-core";
import type {
  ISourceSyncRepository,
  ParsedSourceChannel,
} from "@/domain/source-sync";

export interface PrepareM3uSyncInput {
  readonly sourceId: string;
  readonly changeSetId: string;
  readonly preparedTaskId: string;
  /** Optional request-time version guard carried by the preview protocol. */
  readonly expectedSourceVersion?: number;
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface PrepareM3uSyncResult {
  readonly snapshotId: string;
  readonly itemCount: number;
  readonly summary: ReturnType<typeof summarize>;
  readonly fingerprint: string;
  /** True when an unexpired snapshot for this fingerprint was reused (009). */
  readonly reused: boolean;
  /** Source config version captured at prepare time (009, blocks stale apply). */
  readonly sourceVersion: number;
  /** True when the anomaly classifier flagged this snapshot (009, FR-016). */
  readonly requiresConfirmation: boolean;
  /** Structured warnings emitted by the anomaly classifier (009). */
  readonly warnings: ReadonlyArray<{
    readonly code:
      | "empty-snapshot"
      | "deletion-ratio-exceeded"
      | "duplicate-identity";
    readonly message: string;
    readonly deletionRatio?: number;
  }>;
}

export class PrepareM3uSyncUseCase {
  constructor(private readonly repo: ISourceSyncRepository) {}

  async execute(input: PrepareM3uSyncInput): Promise<PrepareM3uSyncResult> {
    const { sourceId, changeSetId, preparedTaskId } = input;
    void changeSetId;

    const source = await this.repo.loadSource(sourceId);
    if (!source || !source.enabled) {
      throw new Error("Source not found or disabled");
    }
    if (
      input.expectedSourceVersion !== undefined &&
      source.version !== input.expectedSourceVersion
    ) {
      throw new Error(
        `Stale source version: expected ${input.expectedSourceVersion}, current ${source.version}`,
      );
    }

    await input.updateProgress?.(10, "download");
    const { content, statusCode } = await downloadSource(source.url, {
      headers: source.headers ?? undefined,
    });
    if (statusCode !== 200 || !content) {
      await this.repo.recordSourceSync(sourceId, "failed", null);
      throw new Error(`Download failed: HTTP ${statusCode}`);
    }

    await input.updateProgress?.(40, "parse");
    const entries = parseM3U(content);
    const parsed: ParsedSourceChannel[] = entries.map((e) => ({
      channelIdentity: generateChannelIdentity(sourceId, e),
      displayName: e.displayName,
      groupTitle: e.groupTitle,
      tvgId: e.tvgId,
      tvgLogo: e.tvgLogo,
      streamUrl: e.streamUrl,
    }));

    // Stage the immutable snapshot idempotently (009: fingerprint reuse).
    await input.updateProgress?.(55, "stage");
    const snapshotItems: SnapshotItem[] = parsed.map((p) => ({
      channelIdentity: p.channelIdentity,
      payload: {
        displayName: p.displayName,
        groupTitle: p.groupTitle,
        tvgId: p.tvgId,
        tvgLogo: p.tvgLogo,
        streamUrl: p.streamUrl,
      },
    }));
    const fingerprint = computeFingerprint(snapshotItems);
    const staged = await this.repo.stageSnapshotIdempotent(
      sourceId,
      "m3u",
      fingerprint,
      source.version,
      parsed,
      preparedTaskId,
    );

    // Compute the diff against current PRESENT channels (009: anomaly baseline
    // is the live present count, not the historical current row count).
    await input.updateProgress?.(75, "diff");
    const present = await this.repo.loadPresentChannels(sourceId);
    const changeItems = computeChangeItems(
      snapshotItems,
      present.map((c) => ({
        channelIdentity: c.channelIdentity,
        automaticName: c.displayName,
        manualName: null,
        manualGroup: null,
        lifecycle: "active" as const,
        manualEpgLocked: false,
        primaryStreamId: null,
      })),
    );
    const summary = summarize(changeItems);

    // 009: anomaly classification. First import (present count == 0) never
    // triggers confirmation; empty snapshot / ≥25% deletion against non-empty
    // baseline flips requiresConfirmation to true (FR-016).
    const anomaly = classifyAnomaly({
      snapshotItemCount: parsed.length,
      currentPresentCount: present.length,
      missingCount: summary.missing,
    });
    const duplicateWarning =
      summary.conflicts > 0
        ? [
            {
              code: "duplicate-identity" as const,
              message: `snapshot contains ${summary.conflicts} duplicate channel identity item(s)`,
            },
          ]
        : [];
    const warnings = [...anomaly.warnings, ...duplicateWarning];

    await input.updateProgress?.(100, "ready");
    return {
      snapshotId: staged.snapshotId,
      itemCount: staged.itemCount,
      summary,
      fingerprint,
      reused: staged.reused,
      sourceVersion: source.version,
      requiresConfirmation:
        anomaly.requiresConfirmation || summary.conflicts > 0,
      warnings,
    };
  }
}
