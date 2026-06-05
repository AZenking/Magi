import { Module } from "@nestjs/common";
import { ChannelModule } from "./channel/channel.module";
import { ProgrammeModule } from "./programme/programme.module";
import { TaskModule } from "./task/task.module";
import { SourceModule } from "./source/source.module";
import { OutputModule } from "./output/output.module";
import { EpgModule } from "./epg/epg.module";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
  imports: [DashboardModule, ChannelModule, ProgrammeModule, TaskModule, SourceModule, OutputModule, EpgModule],
})
export class HttpModule {}
