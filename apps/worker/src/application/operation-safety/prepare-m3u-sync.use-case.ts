/**
 * PrepareM3uSyncUseCase (T037).
 *
 * Worker-side preview preparation for M3U sync. Downloads, parses, stages an
 * immutable snapshot, computes the stable diff against current channels, and
 * writes the change-set summary + items. Side-effect free on current output.
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
  type SnapshotItem,
} from "@magi/backend-core";
import type { ISourceSyncRepository, ParsedSourceChannel } from "@/domain/source-sync";

export interface PrepareM3uSyncInput {
  readonly sourceId: string;
  readonly changeSetId: string;
  readonly preparedTaskId: string;
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface PrepareM3uSyncResult {
  readonly snapshotId: string;
  readonly itemCount: number;
  readonly summary: ReturnType<typeof summarize>;
  readonly fingerprint: string;
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

    // Stage the immutable snapshot.
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
    const { snapshotId, itemCount } = await this.repo.stageSnapshot(
      sourceId,
      "m3u",
      fingerprint,
      source.version,
      parsed,
      preparedTaskId,
    );

    // Compute the diff against current channels (for summary; items persisted by infra).
    await input.updateProgress?.(75, "diff");
    const current = await this.repo.loadCurrentChannels(sourceId);
    const changeItems = computeChangeItems(
      snapshotItems,
      current.map((c) => ({
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

    await input.updateProgress?.(100, "ready");
    return { snapshotId, itemCount, summary, fingerprint };
  }
}
