import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  ApiResponse,
  DeviceAuthorizationDecision,
  DeviceAuthorizationPreview,
  DeviceClient as DeviceClientVo,
  DeviceClientPage,
  RevokeDeviceClientResult,
} from "@magi/types";
import {
  AccountClientListQuerySchema,
  ApproveDeviceAuthorizationRequestSchema,
  RenameDeviceClientRequestSchema,
  UserCodeSchema,
} from "@magi/types";
import {
  derivePresenceStatus,
  type DeviceClient,
  type DeviceClientProjection,
} from "@/domain/device-client";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { Idempotent } from "../../shared/http/idempotency.interceptor";
import { AppendAuditEventUseCase } from "../../application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS } from "../../domain/audit/audit-actions";
import { ListDeviceClientsUseCase } from "../../application/device-client/list-device-clients.use-case";
import { RenameDeviceClientUseCase } from "../../application/device-client/rename-device-client.use-case";
import { RevokeDeviceClientUseCase } from "../../application/device-client/revoke-device-client.use-case";
import { InspectDeviceAuthorizationUseCase } from "../../application/device-client/inspect-device-authorization.use-case";
import { DecideDeviceAuthorizationUseCase } from "../../application/device-client/decide-device-authorization.use-case";

@ApiTags("账户客户端")
@Controller("api/account")
@UseGuards(AuthGuard)
export class AccountClientController {
  constructor(
    @Inject(ListDeviceClientsUseCase)
    private readonly listUc: ListDeviceClientsUseCase,
    @Inject(RenameDeviceClientUseCase)
    private readonly renameUc: RenameDeviceClientUseCase,
    @Inject(RevokeDeviceClientUseCase)
    private readonly revokeUc: RevokeDeviceClientUseCase,
    @Inject(InspectDeviceAuthorizationUseCase)
    private readonly inspectUc: InspectDeviceAuthorizationUseCase,
    @Inject(DecideDeviceAuthorizationUseCase)
    private readonly decideUc: DecideDeviceAuthorizationUseCase,
    @Inject(AppendAuditEventUseCase)
    private readonly audit: AppendAuditEventUseCase,
  ) {}

  @Get("clients")
  @ApiOperation({ summary: "查看当前账户的设备客户端" })
  async list(
    @CurrentUser() user: { id: string },
    @Query() query: unknown,
  ): Promise<ApiResponse<DeviceClientPage>> {
    const parsed = AccountClientListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    const result = await this.listUc.execute({
      ownerUserId: user.id,
      ...parsed.data,
    });
    return {
      success: true,
      data: {
        items: result.items.map(toClientVo),
        total: result.total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        totalPages: Math.ceil(result.total / parsed.data.pageSize) || 1,
        asOf: result.asOf.toISOString(),
      },
    };
  }

  @Patch("clients/:clientId")
  async rename(
    @Param("clientId") clientId: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<DeviceClientVo>> {
    const parsed = RenameDeviceClientRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    const updated = await this.renameUc.execute({
      id: clientId,
      ownerUserId: user.id,
      displayName: parsed.data.displayName,
    });
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.deviceClient.rename,
      targetType: "device_client",
      targetId: updated.id,
      displayName: updated.displayName,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { changedFields: ["displayName"] },
    });
    return {
      success: true,
      data: toClientVo({
        ...updated,
        presenceStatus: derivePresenceStatus(updated, new Date()),
        asOf: new Date(),
      }),
    };
  }

  @Post("clients/:clientId/revoke")
  @HttpCode(HttpStatus.OK)
  @Idempotent("device-client.revoke")
  async revoke(
    @Param("clientId") clientId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<RevokeDeviceClientResult>> {
    if (!idempotencyKey)
      throw new BadRequestException({
        code: "idempotency-key-required",
        status: 400,
      });
    const result = await this.revokeUc.execute({
      id: clientId,
      ownerUserId: user.id,
      revokedBy: user.id,
      requestId: currentRequestId(),
    });
    const client = toClientVo({
      ...result.client,
      presenceStatus: "revoked",
      asOf: new Date(),
    });
    return {
      success: true,
      data: {
        client,
        accessTokensRevoked: result.accessTokensRevoked,
        refreshTokensRevoked: result.refreshTokensRevoked,
      },
    };
  }

  @Get("device-authorizations/:userCode")
  async inspect(
    @Param("userCode") userCode: string,
  ): Promise<ApiResponse<DeviceAuthorizationPreview>> {
    const parsed = UserCodeSchema.safeParse(userCode);
    if (!parsed.success)
      throw new BadRequestException({
        code: "authorization-code-unavailable",
        status: 404,
      });
    const result = await this.inspectUc.execute(parsed.data);
    return {
      success: true,
      data: { ...result, expiresAt: result.expiresAt.toISOString() },
    };
  }

  @Post("device-authorizations/:userCode/approve")
  @HttpCode(HttpStatus.OK)
  @Idempotent("device-client.authorization.approve")
  async approve(
    @Param("userCode") userCode: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<DeviceAuthorizationDecision>> {
    if (!idempotencyKey)
      throw new BadRequestException({
        code: "idempotency-key-required",
        status: 400,
      });
    const code = UserCodeSchema.safeParse(userCode);
    const parsed = ApproveDeviceAuthorizationRequestSchema.safeParse(body);
    if (!code.success || !parsed.success)
      throw new BadRequestException({ code: "validation-failed" });
    const result = await this.decideUc.approve({
      userCode: code.data,
      ownerUserId: user.id,
      displayName: parsed.data.displayName,
    });
    return {
      success: true,
      data: { ...result, expiresAt: result.expiresAt.toISOString() },
    };
  }

  @Post("device-authorizations/:userCode/deny")
  @HttpCode(HttpStatus.OK)
  @Idempotent("device-client.authorization.deny")
  async deny(
    @Param("userCode") userCode: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<DeviceAuthorizationDecision>> {
    if (!idempotencyKey)
      throw new BadRequestException({
        code: "idempotency-key-required",
        status: 400,
      });
    const code = UserCodeSchema.safeParse(userCode);
    if (!code.success)
      throw new BadRequestException({
        code: "authorization-code-unavailable",
        status: 404,
      });
    const result = await this.decideUc.deny({
      userCode: code.data,
      ownerUserId: user.id,
    });
    return {
      success: true,
      data: { ...result, expiresAt: result.expiresAt.toISOString() },
    };
  }
}

function toClientVo(
  client:
    | DeviceClientProjection
    | (DeviceClient & { presenceStatus?: string; asOf?: Date }),
): DeviceClientVo {
  const presenceStatus =
    client.status === "revoked"
      ? "revoked"
      : ((client as DeviceClientProjection).presenceStatus ?? "offline");
  return {
    id: client.id,
    displayName: client.displayName,
    deviceType: client.deviceType,
    platform: client.platform,
    platformVersion: client.platformVersion,
    appVersion: client.appVersion,
    identitySummary: client.identitySummary,
    status: presenceStatus as DeviceClientVo["status"],
    registeredAt: client.registeredAt.toISOString(),
    lastActiveAt: client.lastHeartbeatAt?.toISOString() ?? null,
    revokedAt: client.revokedAt?.toISOString() ?? null,
  };
}
