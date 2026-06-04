import { Inject, Injectable } from "@nestjs/common";
import type { IXmltvSourceRepository, ISourceDownloader } from "@/domain/source-management";
import type {
  IRawXmltvChannelRepository,
  IProgrammeRepository,
  IXmltvParser,
  RawXmltvChannel,
} from "@/domain/channel-catalog";
import type { ITaskRepository } from "@/domain/task-execution";

export interface SyncXmltvResult {
  status: "success" | "failed";
  channelCount: number;
  programmeCount: number;
  error?: string;
}

@Injectable()
export class SyncXmltvSourceUseCase {
  constructor(
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly sourceRepo: IXmltvSourceRepository,
    @Inject("RAW_XMLTV_CHANNEL_REPOSITORY")
    private readonly rawChannelRepo: IRawXmltvChannelRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
    @Inject("SOURCE_DOWNLOADER")
    private readonly downloader: ISourceDownloader,
    @Inject("XMLTV_PARSER")
    private readonly parser: IXmltvParser,
    @Inject("TASK_REPOSITORY")
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(sourceId: string): Promise<SyncXmltvResult> {
    const source = await this.sourceRepo.findById(sourceId);
    if (!source || !source.enabled) {
      return {
        status: "failed",
        channelCount: 0,
        programmeCount: 0,
        error: "Source not found or disabled",
      };
    }

    const startedAt = new Date();
    const task = await this.taskRepo.create({
      sourceType: "xmltv",
      taskType: "xmltv-sync",
      sourceId,
      status: "running",
      startedAt,
      finishedAt: null,
      error: null,
      progress: 0,
      currentStep: "download",
      executionLog: null,
      importedCount: 0,
      addedCount: 0,
      updatedCount: 0,
      removedCount: 0,
    });

    try {
      const { content, statusCode } = await this.downloader.download(source.url, {
        headers: source.headers ?? undefined,
      });

      if (statusCode !== 200 || !content) {
        await this.sourceRepo.updateSyncStatus(sourceId, {
          lastSyncAt: new Date(),
          lastSyncStatus: "failed",
        });
        await this.taskRepo.update(task.id, {
          status: "failed",
          finishedAt: new Date(),
          error: `Download failed: HTTP ${statusCode}`,
        });
        return {
          status: "failed",
          channelCount: 0,
          programmeCount: 0,
          error: `Download failed: HTTP ${statusCode}`,
        };
      }

      const data = this.parser.parse(content);
      const now = new Date();

      await this.rawChannelRepo.deleteBySourceId(sourceId);
      await this.programmeRepo.deleteBySourceId(sourceId);

      const rawChannels: Omit<RawXmltvChannel, "id" | "createdAt" | "updatedAt">[] =
        data.channels.map((ch) => ({
          sourceId,
          xmltvId: ch.id,
          displayName: ch.displayName,
          icon: ch.icon,
          syncedAt: now,
        }));

      if (rawChannels.length > 0) {
        await this.rawChannelRepo.createBatch(rawChannels);
      }

      const filteredProgrammes = data.programmes.filter((p) =>
        this.parser.isInEpgWindow(p.start, p.stop),
      );

      if (filteredProgrammes.length > 0) {
        await this.programmeRepo.createBatch(
          filteredProgrammes.map((p) => ({
            sourceId,
            xmltvChannelId: p.channel,
            title: p.title || null,
            subTitle: p.subTitle || null,
            desc: p.desc || null,
            category: p.category || null,
            startAt: this.parser.parseDate(p.start),
            stopAt: this.parser.parseDate(p.stop),
          })),
        );
      }

      await this.sourceRepo.updateSyncStatus(sourceId, {
        lastSyncAt: now,
        lastSyncStatus: "success",
      });

      await this.taskRepo.update(task.id, {
        status: "success",
        finishedAt: new Date(),
        importedCount: data.channels.length + filteredProgrammes.length,
        addedCount: data.channels.length,
      });

      return {
        status: "success",
        channelCount: data.channels.length,
        programmeCount: filteredProgrammes.length,
      };
    } catch (err) {
      const errorMsg = (err instanceof Error ? err.message : "Unknown error").slice(0, 500);
      await this.sourceRepo.updateSyncStatus(sourceId, {
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
      });
      await this.taskRepo.update(task.id, {
        status: "failed",
        finishedAt: new Date(),
        error: errorMsg,
      });
      return {
        status: "failed",
        channelCount: 0,
        programmeCount: 0,
        error: errorMsg,
      };
    }
  }
}
