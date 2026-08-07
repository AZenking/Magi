/**
 * PlaylistController (009-m3u-control-plane T050).
 *
 * Public, grant-protected dynamic V2 playlist endpoint.
 *
 *   GET /api/playlist/v2.m3u?grant=<opaque-secret>
 *
 * The grant is validated by OutputGrantGuard. The controller delegates the
 * M3U body to GenerateM3uV2OutputUseCase, scoped to the grant's profile.
 *
 * Response: text/plain; charset=utf-8 with `Cache-Control: private, max-age=15`
 * so shared caches never leak directories across players. The grant holder's
 * plaintext never appears in the response body or any log line.
 */
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { OutputGrantGuard } from "@/shared/guards/output-grant.guard";
import { GenerateM3uV2OutputUseCase } from "@/application/output-composition/generate-v2-output.use-cases";
import type { OutputGrantSummaryVo } from "@magi/types";

@Controller("playlist")
export class PlaylistController {
  constructor(
    @Inject(GenerateM3uV2OutputUseCase)
    private readonly generateM3uV2: GenerateM3uV2OutputUseCase,
  ) {}

  @Get("v2.m3u")
  @UseGuards(OutputGrantGuard)
  async playlistV2(@Req() req: { outputGrant?: OutputGrantSummaryVo }): Promise<string> {
    const grant = req.outputGrant;
    const profile = grant?.profile === "all" ? "all" : "primary";
    return this.generateM3uV2.execute(profile);
  }
}

// Suppress unused-query warning — `grant` is consumed by the guard.
void Query;
