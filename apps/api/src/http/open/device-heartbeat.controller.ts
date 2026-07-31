import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { ApiResponse, HeartbeatResponse } from "@magi/types";
import { HeartbeatRequestSchema } from "@magi/types";
import { RecordHeartbeatUseCase } from "../../application/device-client/record-heartbeat.use-case";
import {
  AccessTokenGuard,
  type RequestWithPrincipal,
} from "../../shared/guards/access-token.guard";

@ApiTags("设备心跳")
@Controller("api/open/v1/device-clients")
@UseGuards(AccessTokenGuard, ThrottlerGuard)
export class DeviceHeartbeatController {
  constructor(
    @Inject(RecordHeartbeatUseCase)
    private readonly heartbeat: RecordHeartbeatUseCase,
  ) {}

  @ApiOperation({ summary: "记录设备前台心跳" })
  @Post("heartbeat")
  @HttpCode(HttpStatus.OK)
  async record(
    @Body() body: unknown,
    @Req() req: RequestWithPrincipal,
  ): Promise<ApiResponse<HeartbeatResponse>> {
    const parsed = HeartbeatRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    const principal = req.principal;
    if (
      !principal ||
      principal.kind !== "device" ||
      !principal.scope.split(/\s+/u).includes("client:heartbeat")
    ) {
      throw new ForbiddenException({
        code: "device-principal-required",
        status: 403,
      });
    }
    const result = await this.heartbeat.execute({
      deviceClientId: principal.deviceClientId,
      appVersion: parsed.data.app_version,
      platformVersion: parsed.data.platform_version,
    });
    return {
      success: true,
      data: {
        server_time: result.serverTime.toISOString(),
        last_active_at: result.lastActiveAt.toISOString(),
        next_heartbeat_in_seconds: 60,
        online_window_seconds: 150,
        ...(result.contentRevision
          ? { content_revision: result.contentRevision }
          : {}),
      },
    };
  }
}
