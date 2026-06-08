import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { M3uSourceRepository } from "../../infrastructure/database/m3u-source.repository";
import { XmltvSourceRepository } from "../../infrastructure/database/xmltv-source.repository";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { HealthStatsRepository } from "../../infrastructure/database/health-stats.repository";
import { GetHealthSummaryUseCase } from "../../application/dashboard/get-health-summary.use-case";

@Module({
  controllers: [DashboardController],
  providers: [
    { provide: "M3U_SOURCE_REPOSITORY", useClass: M3uSourceRepository },
    { provide: "XMLTV_SOURCE_REPOSITORY", useClass: XmltvSourceRepository },
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    { provide: "HEALTH_STATS_REPOSITORY", useClass: HealthStatsRepository },
    GetHealthSummaryUseCase,
  ],
})
export class DashboardModule {}
