import { Module } from "@nestjs/common";
import { LoggerModule } from "./infrastructure/logger/logger.module";
import { HttpModule } from "./http/http.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";

@Module({
  imports: [LoggerModule, InfrastructureModule, HttpModule],
})
export class AppModule {}
