import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { OpenApiController } from "./open.controller";
import { OutputModule } from "../output/output.module";
import { ApiKeyModule } from "../api-key/api-key.module";
import { ResolvePlaybackUseCase } from "../../application/open/resolve-playback.use-case";

/**
 * OpenModule — public read-only API (005-open-channels-epg-api).
 *
 * Reuses OutputModule's read-only use-cases + repo tokens (imported + exported
 * there) and ApiKeyModule's guard + repository token. ThrottlerModule provides
 * per-key rate limiting (60 req/min default). ResolvePlaybackUseCase is wired
 * here (it depends on the canonical-channel + stream repo tokens).
 */
@Module({
  imports: [
    OutputModule,
    ApiKeyModule,
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 60 },
    ]),
  ],
  controllers: [OpenApiController],
  providers: [ResolvePlaybackUseCase],
})
export class OpenModule {}
