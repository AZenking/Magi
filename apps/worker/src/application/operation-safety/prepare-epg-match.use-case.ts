/**
 * PrepareEpgMatchUseCase (T039).
 *
 * Generates EPG match candidates and classifies them into exact/fuzzy/conflict/
 * unmatched. Side-effect free on current bindings (FR-006). Manual-locked
 * bindings are reported as preserved, never overwritten.
 */
import { EpgMatcher, type EpgMatchInput, type EpgMatchResult } from "@magi/backend-core";
import type { IEpgSyncRepository } from "@/domain/source-sync/epg-sync.repository";

export interface PrepareEpgMatchInput {
  readonly xmltvSourceId: string;
  readonly updateProgress?: (percent: number, step: string) => Promise<void>;
}

export interface PrepareEpgMatchResult {
  readonly ready: boolean;
  readonly blockerCode: string | null;
  readonly summary: { exact: number; fuzzy: number; conflict: number; unmatched: number; preserved: number };
  readonly matches: EpgMatchResult[];
}

export class PrepareEpgMatchUseCase {
  constructor(private readonly repo: IEpgSyncRepository) {}

  async execute(input: PrepareEpgMatchInput): Promise<PrepareEpgMatchResult> {
    const readiness = await this.repo.isXmltvReady(input.xmltvSourceId);
    if (!readiness.ready) {
      return {
        ready: false,
        blockerCode: readiness.blockerCode,
        summary: { exact: 0, fuzzy: 0, conflict: 0, unmatched: 0, preserved: 0 },
        matches: [],
      };
    }

    await input.updateProgress?.(20, "load-candidates");
    const [candidates, canonicals] = await Promise.all([
      this.repo.loadXmltvCandidates(input.xmltvSourceId),
      this.repo.loadCanonicalChannelsForEpg(),
    ]);

    await input.updateProgress?.(50, "match");
    const matcher = new EpgMatcher();
    const xmltvChannels = candidates.map((c) => ({ id: c.xmltvChannelId, displayName: c.displayName }));
    const matches: EpgMatchResult[] = [];
    for (const canonical of canonicals) {
      const matchInput: EpgMatchInput = {
        channelTvgId: canonical.tvgId ?? null,
        channelTvgName: null,
        channelDisplayName: canonical.standardName,
        manualEpgChannelId: canonical.epgChannelId ?? null,
        xmltvChannels,
      };
      matches.push(matcher.match(matchInput));
    }

    // Classify + count preserved (manual-locked).
    const summary = { exact: 0, fuzzy: 0, conflict: 0, unmatched: 0, preserved: 0 };
    for (const m of matches) {
      const canonical = canonicals.find((c) => c.id === m.xmltvChannelId); // best-effort link
      if (canonical?.manualEpgLocked) {
        summary.preserved++;
        continue;
      }
      if (m.matchType === "tvg-id") summary.exact++;
      else if (m.matchType === "fuzzy" || m.matchType === "display-name") summary.fuzzy++;
      else if (m.matchType === "conflict") summary.conflict++;
      else if (!m.matched) summary.unmatched++;
    }

    await input.updateProgress?.(100, "ready");
    return { ready: true, blockerCode: null, summary, matches };
  }
}
