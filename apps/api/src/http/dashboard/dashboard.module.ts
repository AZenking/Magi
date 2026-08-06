import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { M3uSourceRepository } from "../../infrastructure/database/m3u-source.repository";
import { XmltvSourceRepository } from "../../infrastructure/database/xmltv-source.repository";
import { ChannelRepository } from "../../infrastructure/database/channel.repository";
import { ProgrammeRepository } from "../../infrastructure/database/programme.repository";
import { HealthStatsRepository } from "../../infrastructure/database/health-stats.repository";
import { SyncLogRepository } from "../../infrastructure/database/sync-log.repository";
import { GetHealthSummaryUseCase } from "../../application/dashboard/get-health-summary.use-case";
import { GetOperationsSummaryUseCase } from "../../application/dashboard/get-operations-summary.use-case";
import type { IHealthStatsRepository } from "@/domain/output-composition";
import type { ITaskRepository } from "@/domain/task-execution";
import { OauthModule } from "../oauth-client/oauth.module";

@Module({
  imports: [OauthModule],
  controllers: [DashboardController],
  providers: [
    { provide: "M3U_SOURCE_REPOSITORY", useClass: M3uSourceRepository },
    { provide: "XMLTV_SOURCE_REPOSITORY", useClass: XmltvSourceRepository },
    { provide: "CHANNEL_REPOSITORY", useClass: ChannelRepository },
    { provide: "PROGRAMME_REPOSITORY", useClass: ProgrammeRepository },
    { provide: "HEALTH_STATS_REPOSITORY", useClass: HealthStatsRepository },
    { provide: "TASK_REPOSITORY", useClass: SyncLogRepository },
    GetHealthSummaryUseCase,
    {
      provide: GetOperationsSummaryUseCase,
      useFactory: (healthRepo: IHealthStatsRepository, taskRepo: ITaskRepository) =>
        new GetOperationsSummaryUseCase(healthRepo, taskRepo),
      inject: ["HEALTH_STATS_REPOSITORY", "TASK_REPOSITORY"],
    },
  ],
})
export class DashboardModule {}
