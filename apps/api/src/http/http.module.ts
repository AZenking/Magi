import { Module } from "@nestjs/common";
import { ChannelModule } from "./channel/channel.module";
import { ProgrammeModule } from "./programme/programme.module";
import { EpgModule } from "./epg/epg.module";
import { TaskModule } from "./task/task.module";
import { SourceModule } from "./source/source.module";

@Module({
  imports: [ChannelModule, ProgrammeModule, EpgModule, TaskModule, SourceModule],
})
export class HttpModule {}
