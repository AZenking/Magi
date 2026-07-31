import { Module } from "@nestjs/common";
import { ChannelModule } from "./channel/channel.module";
import { ProgrammeModule } from "./programme/programme.module";
import { TaskModule } from "./task/task.module";
import { SourceModule } from "./source/source.module";
import { OutputModule } from "./output/output.module";
import { EpgModule } from "./epg/epg.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { OperationModule } from "./operation/operation.module";
import { BackupAuditModule } from "./backup/backup.module";
import { AuditModule } from "./audit/audit.module";
import { OauthModule } from "./oauth-client/oauth.module";
import { OpenModule } from "./open/open.module";

@Module({
  imports: [AuditModule, DashboardModule, ChannelModule, ProgrammeModule, TaskModule, SourceModule, OutputModule, EpgModule, OperationModule, BackupAuditModule, OauthModule, OpenModule],
})
export class HttpModule {}
