/**
 * OauthClientAdminController — OAuth2 client management (004-safe-operations).
 *
 * Behind AuthGuard (admin session cookie) — NOT AccessTokenGuard. This is the
 * reverse-isolation counterpart: access tokens can NEVER reach these routes.
 * All mutations are audited.
 *
 * Routes:
 *   POST   /api/admin/oauth-clients              create (secret returned once)
 *   GET    /api/admin/oauth-clients              list (paginated, no secret/hash)
 *   POST   /api/admin/oauth-clients/:id/disable  disable (reversible, tokens live)
 *   POST   /api/admin/oauth-clients/:id/enable   enable
 *   POST   /api/admin/oauth-clients/:id/revoke   revoke (terminal, batch-revoke tokens)
 *   DELETE /api/admin/oauth-clients/:id          physical delete
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  HttpCode,
  Body,
  Query,
  Param,
  Inject,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from "@nestjs/swagger";
import type { ApiResponse, PaginatedResponse, OauthClientVo, OauthClientCreatedVo } from "@magi/types";
import { CreateOauthClientSchema, ListOauthClientsQuerySchema } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { AppendAuditEventUseCase } from "../../application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS } from "../../domain/audit/audit-actions";
import { CreateOauthClientUseCase } from "../../application/oauth/create-oauth-client.use-case";
import { ListOauthClientsUseCase } from "../../application/oauth/list-oauth-clients.use-case";
import { TransitionOauthClientStatusUseCase, type TransitionTarget } from "../../application/oauth/transition-oauth-client-status.use-case";
import { DeleteOauthClientUseCase } from "../../application/oauth/delete-oauth-client.use-case";
import type { OauthClient } from "@/domain/oauth";

@Controller("api/admin/oauth-clients")
@UseGuards(AuthGuard)
@ApiTags("客户端凭证管理")
export class OauthClientAdminController {
  constructor(
    @Inject(CreateOauthClientUseCase) private readonly createUc: CreateOauthClientUseCase,
    @Inject(ListOauthClientsUseCase) private readonly listUc: ListOauthClientsUseCase,
    @Inject(TransitionOauthClientStatusUseCase) private readonly transitionUc: TransitionOauthClientStatusUseCase,
    @Inject(DeleteOauthClientUseCase) private readonly deleteUc: DeleteOauthClientUseCase,
    @Inject(AppendAuditEventUseCase) private readonly audit: AppendAuditEventUseCase,
  ) {}

  /** Create a client. The plaintext secret is returned ONCE. */
  @Post()
  @ApiOperation({ summary: "创建客户端（明文 secret 仅返回一次）" })
  @SwaggerResponse({ status: 201, description: "含一次性明文 secret" })
  async create(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<OauthClientCreatedVo>> {
    const parsed = CreateOauthClientSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const { client, plaintextSecret } = await this.createUc.execute({
      clientId: parsed.data.clientId,
      clientName: parsed.data.clientName,
      createdBy: user.id,
    });
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.oauthClient.create,
      targetType: "oauth_client",
      targetId: client.id,
      displayName: client.clientName,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { clientId: client.clientId, secretPrefix: client.secretPrefix },
    });
    return { success: true, data: toCreatedVo(client, plaintextSecret) };
  }

  /** List clients. Never returns plaintext or hash. */
  @Get()
  @ApiOperation({ summary: "客户端列表（不含明文）" })
  @SwaggerResponse({ status: 200, description: "分页客户端列表（仅打码前缀）" })
  async list(@Query() query: unknown): Promise<ApiResponse<PaginatedResponse<OauthClientVo>>> {
    const parsed = ListOauthClientsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ code: "validation-failed", detail: parsed.error.flatten() });
    }
    const { items, total } = await this.listUc.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      search: parsed.data.search,
    });
    return {
      success: true,
      data: {
        items: items.map(toClientVo),
        total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        totalPages: Math.ceil(total / parsed.data.pageSize) || 1,
      },
    };
  }

  /** Shared disable/enable/revoke handler — status-machine-guarded. */
  private async transition(
    id: string,
    target: TransitionTarget,
    user: { id: string },
  ): Promise<ApiResponse<OauthClientVo>> {
    const updated = await this.transitionUc.execute(id, target);
    const action =
      target === "disabled"
        ? AUDIT_ACTIONS.oauthClient.disable
        : target === "active"
          ? AUDIT_ACTIONS.oauthClient.enable
          : AUDIT_ACTIONS.oauthClient.revoke;
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action,
      targetType: "oauth_client",
      targetId: updated.id,
      displayName: updated.clientName,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { to: target, clientId: updated.clientId },
    });
    return { success: true, data: toClientVo(updated) };
  }

  @Post(":id/disable")
  @ApiOperation({ summary: "禁用（可逆，已有 token 不受影响）" })
  disable(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "disabled", user);
  }

  @Post(":id/enable")
  @ApiOperation({ summary: "启用（仅 disabled 可启用）" })
  enable(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "active", user);
  }

  @Post(":id/revoke")
  @ApiOperation({ summary: "永久吊销（不可逆，批量失效所有 token）" })
  revoke(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "revoked", user);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ summary: "物理删除客户端" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<null>> {
    await this.deleteUc.execute(id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.oauthClient.delete,
      targetType: "oauth_client",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
    });
    return { success: true, data: null };
  }
}

/** Domain OauthClient → OauthClientVo (never plaintext/hash). */
function toClientVo(c: OauthClient): OauthClientVo {
  return {
    id: c.id,
    clientId: c.clientId,
    clientName: c.clientName,
    secretPrefix: c.secretPrefix ?? "",
    status: c.status,
    lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Domain OauthClient → OauthClientCreatedVo (includes plaintext secret once). */
function toCreatedVo(c: OauthClient, plaintextSecret: string): OauthClientCreatedVo {
  return { ...toClientVo(c), clientSecret: plaintextSecret };
}
