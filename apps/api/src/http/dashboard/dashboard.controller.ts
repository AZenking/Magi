import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ApiResponse } from "@magi/types";
import type { IM3uSourceRepository, IXmltvSourceRepository } from "@/domain/source-management";
import type { IChannelRepository, IProgrammeRepository } from "@/domain/channel-catalog";
import { GetHealthSummaryUseCase } from "../../application/dashboard/get-health-summary.use-case";
import { AuthGuard } from "../../shared/guards/auth.guard";

@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
    @Inject("CHANNEL_REPOSITORY")
    private readonly channelRepo: IChannelRepository,
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
    @Inject(GetHealthSummaryUseCase)
    private readonly healthSummaryUc: GetHealthSummaryUseCase,
  ) {}

  @Get("stats")
  async getStats(): Promise<
    ApiResponse<{
      m3u: number;
      xmltv: number;
      channels: number;
      programmes: number;
      synced: number;
    }>
  > {
    const [m3uSources, xmltvSources, channels, programmes] = await Promise.all([
      this.m3uRepo.findAll(),
      this.xmltvRepo.findAll(),
      this.channelRepo.findAll({ page: 1, pageSize: 1 }),
      this.programmeRepo.findAll({ page: 1, pageSize: 1 }),
    ]);

    const allChannels = await this.channelRepo.findAll({ page: 1, pageSize: 50000 });

    return {
      success: true,
      data: {
        m3u: m3uSources.length,
        xmltv: xmltvSources.length,
        channels: channels.total,
        programmes: programmes.total,
        synced: allChannels.items.filter((c) => c.epgChannelId).length,
      },
    };
  }

  @Get("health-summary")
  async getHealthSummary() {
    const data = await this.healthSummaryUc.execute();
    return { success: true, data };
  }
}
