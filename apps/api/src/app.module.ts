import { Module } from "@nestjs/common";
import { HttpModule } from "./http/http.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";

@Module({
  imports: [InfrastructureModule, HttpModule],
})
export class AppModule {}
