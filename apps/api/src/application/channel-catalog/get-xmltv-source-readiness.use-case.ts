/**
 * GetXmltvSourceReadinessUseCase (T067).
 *
 * Checks whether an XMLTV source is ready for EPG matching: enabled,
 * successfully synced, non-empty, and fresh. Returns blocker codes + repair
 * action URLs (FR-009, contracts/common.md SourceReadiness).
 */
import type { IXmltvSourceRepository } from "@/domain/source-management";

export interface ReadinessResult {
  readonly canSync: boolean;
  readonly canMatch: boolean;
  readonly blockerCodes: readonly string[];
  readonly blockerActions: ReadonlyArray<{ code: string; actionUrl: string; message: string }>;
}

export class GetXmltvSourceReadinessUseCase {
  constructor(private readonly xmltvRepo: IXmltvSourceRepository) {}

  async execute(sourceId: string): Promise<ReadinessResult> {
    const source = await this.xmltvRepo.findById(sourceId);
    const blockerCodes: string[] = [];
    const blockerActions: Array<{ code: string; actionUrl: string; message: string }> = [];

    if (!source) {
      return {
        canSync: false,
        canMatch: false,
        blockerCodes: ["xmltv-source-not-found"],
        blockerActions: [
          { code: "xmltv-source-not-found", actionUrl: "/dashboard/sources", message: "来源不存在，请添加 XMLTV 来源" },
        ],
      };
    }

    if (!source.enabled) {
      blockerCodes.push("xmltv-source-disabled");
      blockerActions.push({
        code: "xmltv-source-disabled",
        actionUrl: `/dashboard/sources?sourceId=${sourceId}`,
        message: "来源已禁用，请启用",
      });
    }

    const lastSync = source.lastSyncAt ? source.lastSyncAt.getTime() : 0;
    const syncFailed = source.lastSyncStatus === "failed";
    const neverSynced = lastSync === 0;
    if (neverSynced || syncFailed) {
      blockerCodes.push("xmltv-not-synced");
      blockerActions.push({
        code: "xmltv-not-synced",
        actionUrl: `/dashboard/sources?sourceId=${sourceId}&action=sync`,
        message: syncFailed ? "上次同步失败，请重试" : "从未同步，请先同步",
      });
    }

    // Freshness: default 1440 min (24h); configurable per source.
    const thresholdMs = (source.freshnessThresholdMinutes ?? 1440) * 60 * 1000;
    const isStale = lastSync > 0 && Date.now() - lastSync > thresholdMs;
    if (isStale) {
      blockerCodes.push("xmltv-data-stale");
      blockerActions.push({
        code: "xmltv-data-stale",
        actionUrl: `/dashboard/sources?sourceId=${sourceId}&action=sync`,
        message: "数据已过期，请重新同步",
      });
    }

    const canSync = source.enabled;
    const canMatch = blockerCodes.length === 0;

    return { canSync, canMatch, blockerCodes, blockerActions };
  }
}
