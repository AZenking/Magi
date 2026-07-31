import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { OpenApiController } from "./open.controller";
import { OutputModule } from "../output/output.module";
import { OauthModule } from "../oauth-client/oauth.module";
import { ResolvePlaybackUseCase } from "../../application/open/resolve-playback.use-case";

/**
 * OpenModule — public read-only API (005-open-channels-epg-api / 004-safe-operations).
 *
 * Reuses OutputModule's read-only use-cases + repo tokens (imported + exported
 * there) and OauthModule's AccessTokenGuard + repository tokens. ThrottlerModule
 * provides rate limiting (60 req/min default for data endpoints; the token
 * endpoint in OauthModule gets its own tighter limit). ResolvePlaybackUseCase is
 * wired here (it depends on the canonical-channel + stream repo tokens).
 */
@Module({
  imports: [
    OutputModule,
    OauthModule,
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 60 },
    ]),
  ],
  controllers: [OpenApiController],
  providers: [ResolvePlaybackUseCase],
})
export class OpenModule {}
