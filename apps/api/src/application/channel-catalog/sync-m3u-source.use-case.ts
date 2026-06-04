import { Inject, Injectable } from "@nestjs/common";
import type { IM3uSourceRepository, ISourceDownloader } from "@/domain/source-management";
import type {
  IRawM3uChannelRepository,
  IChannelRepository,
  IM3uParser,
  RawM3uChannel,
} from "@/domain/channel-catalog";

export interface SyncM3uResult {
  status: "success" | "failed";
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  error?: string;
}

@Injectable()
export class SyncM3uSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly sourceRepo: IM3uSourceRepository,
    @Inject("RAW_M3U_CHANNEL_REPOSITORY")
    private readonly rawChannelRepo: IRawM3uChannelRepository,
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
    @Inject("SOURCE_DOWNLOADER")
    private readonly downloader: ISourceDownloader,
    @Inject("M3U_PARSER")
    private readonly parser: IM3uParser,
  ) {}

  async execute(sourceId: string): Promise<SyncM3uResult> {
    const source = await this.sourceRepo.findById(sourceId);
    if (!source || !source.enabled) {
      return {
        status: "failed",
        importedCount: 0,
        addedCount: 0,
        updatedCount: 0,
        removedCount: 0,
        error: "Source not found or disabled",
      };
    }

    try {
      const { content, statusCode } = await this.downloader.download(source.url, {
        headers: source.headers ?? undefined,
      });

      if (statusCode !== 200 || !content) {
        await this.sourceRepo.updateSyncStatus(sourceId, {
          lastSyncAt: new Date(),
          lastSyncStatus: "failed",
        });
        return {
          status: "failed",
          importedCount: 0,
          addedCount: 0,
          updatedCount: 0,
          removedCount: 0,
          error: `Download failed: HTTP ${statusCode}`,
        };
      }

      const entries = this.parser.parse(content);
      const now = new Date();

      const activeIdentities: string[] = [];
      const rawChannels: Omit<RawM3uChannel, "id" | "createdAt" | "updatedAt">[] = [];

      for (const entry of entries) {
        const channelIdentity = this.parser.generateChannelIdentity(sourceId, entry);
        activeIdentities.push(channelIdentity);
        rawChannels.push({
          sourceId,
          tvgId: entry.tvgId,
          tvgName: entry.tvgName,
          tvgLogo: entry.tvgLogo,
          groupTitle: entry.groupTitle,
          displayName: entry.displayName,
          streamUrl: entry.streamUrl,
          channelIdentity,
          syncedAt: now,
          disappeared: false,
        });
      }

      await this.rawChannelRepo.deleteBySourceId(sourceId);

      const rawResults = rawChannels.length > 0
        ? await this.rawChannelRepo.createBatch(rawChannels)
        : [];

      // Populate channels table from raw results
      await this.channelRepo.deleteByM3uSourceId(sourceId);

      if (rawResults.length > 0) {
        const channelData = rawResults.map((rc) => ({
          channelIdentity: rc.channelIdentity,
          m3uSourceId: sourceId,
          rawChannelId: rc.id,
          displayName: rc.displayName,
          groupTitle: rc.groupTitle,
          tvgId: rc.tvgId,
          tvgLogo: rc.tvgLogo,
          streamUrl: rc.streamUrl,
          active: true,
          epgMatchType: null as string | null,
          streamStatus: null as string | null,
          streamResponseTime: null as number | null,
          streamCheckedAt: null as Date | null,
          streamError: null as string | null,
        }));
        await this.channelRepo.createBatch(channelData);
      }

      await this.sourceRepo.updateSyncStatus(sourceId, {
        lastSyncAt: now,
        lastSyncStatus: "success",
      });

      return {
        status: "success",
        importedCount: entries.length,
        addedCount: entries.length,
        updatedCount: 0,
        removedCount: 0,
      };
    } catch (err) {
      await this.sourceRepo.updateSyncStatus(sourceId, {
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
      });
      return {
        status: "failed",
        importedCount: 0,
        addedCount: 0,
        updatedCount: 0,
        removedCount: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
