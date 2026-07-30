/**
 * ApiKeyAdminController — API key management (005-open-channels-epg-api).
 *
 * Behind the existing AuthGuard (admin session cookie) — NOT the ApiKeyGuard.
 * This is the reverse-isolation counterpart: API keys can NEVER reach these
 * routes (FR-019). All mutations are audited (FR-005).
 *
 * Contracts: contracts/admin-api-keys.md
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
import type { ApiResponse, PaginatedResponse, ApiKeyVo, ApiKeyCreatedVo } from "@magi/types";
import { CreateApiKeySchema, ListApiKeysQuerySchema } from "@magi/types";
import { AuthGuard } from "../../shared/guards/auth.guard";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { AppendAuditEventUseCase } from "../../application/audit/append-audit-event.use-case";
import { AUDIT_ACTIONS } from "../../domain/audit/audit-actions";
import { CreateApiKeyUseCase } from "../../application/api-key/create-api-key.use-case";
import { ListApiKeysUseCase } from "../../application/api-key/list-api-keys.use-case";
import { TransitionApiKeyStatusUseCase, type TransitionTarget } from "../../application/api-key/transition-api-key-status.use-case";
import { DeleteApiKeyUseCase } from "../../application/api-key/delete-api-key.use-case";
import type { ApiKey } from "@/domain/api-key";

@Controller("api/admin/api-keys")
@UseGuards(AuthGuard)
@ApiTags("API Key 管理")
export class ApiKeyAdminController {
  constructor(
    @Inject(CreateApiKeyUseCase) private readonly createUc: CreateApiKeyUseCase,
    @Inject(ListApiKeysUseCase) private readonly listUc: ListApiKeysUseCase,
    @Inject(TransitionApiKeyStatusUseCase) private readonly transitionUc: TransitionApiKeyStatusUseCase,
    @Inject(DeleteApiKeyUseCase) private readonly deleteUc: DeleteApiKeyUseCase,
    @Inject(AppendAuditEventUseCase) private readonly audit: AppendAuditEventUseCase,
  ) {}

  /** Create a key. The plaintext is returned ONCE (FR-001). */
  @Post()
  @ApiOperation({ summary: "创建 API key（明文仅返回一次）" })
  @SwaggerResponse({ status: 201, description: "含一次性明文 key" })
  async create(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<ApiKeyCreatedVo>> {
    const parsed = CreateApiKeySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    }
    const { apiKey, plaintext } = await this.createUc.execute({
      name: parsed.data.name,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      createdBy: user.id,
    });

    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.apiKey.create,
      targetType: "api_key",
      targetId: apiKey.id,
      displayName: apiKey.name,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { keyPrefix: apiKey.keyPrefix, expiresAt: apiKey.expiresAt?.toISOString() ?? null },
    });

    return {
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: plaintext, // ← plaintext, returned exactly once
        keyPrefix: apiKey.keyPrefix,
        status: apiKey.status,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        lastUsedAt: null,
        createdBy: apiKey.createdBy,
        createdAt: apiKey.createdAt.toISOString(),
      },
    };
  }

  /** List keys. Never returns plaintext or hash (FR-003). */
  @Get()
  @ApiOperation({ summary: "API key 列表（不含明文）" })
  @SwaggerResponse({ status: 200, description: "分页 key 列表（仅打码前缀）" })
  async list(@Query() query: unknown): Promise<ApiResponse<PaginatedResponse<ApiKeyVo>>> {
    const parsed = ListApiKeysQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    }
    const { items, total } = await this.listUc.execute({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      search: parsed.data.search,
    });
    const totalPages = Math.ceil(total / parsed.data.pageSize) || 1;
    return {
      success: true,
      data: {
        items,
        total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        totalPages,
      },
    };
  }

  /** Shared disable/enable/revoke handler — status-machine-guarded (FR-004). */
  private async transition(
    id: string,
    target: TransitionTarget,
    user: { id: string },
  ): Promise<ApiResponse<ApiKeyVo>> {
    const updated = await this.transitionUc.execute(id, target);
    const action =
      target === "disabled"
        ? AUDIT_ACTIONS.apiKey.disable
        : target === "active"
          ? AUDIT_ACTIONS.apiKey.enable
          : AUDIT_ACTIONS.apiKey.revoke;
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action,
      targetType: "api_key",
      targetId: updated.id,
      displayName: updated.name,
      result: "succeeded",
      requestId: currentRequestId(),
      summary: { to: target, keyPrefix: updated.keyPrefix },
    });
    return { success: true, data: toApiKeyVo(updated) };
  }

  @Post(":id/disable")
  @ApiOperation({ summary: "禁用（可逆）" })
  @SwaggerResponse({ status: 200, description: "禁用后的 key" })
  disable(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "disabled", user);
  }

  @Post(":id/enable")
  @ApiOperation({ summary: "启用（仅 disabled 可启用）" })
  @SwaggerResponse({ status: 200, description: "启用后的 key" })
  enable(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "active", user);
  }

  @Post(":id/revoke")
  @ApiOperation({ summary: "永久吊销（不可逆）" })
  @SwaggerResponse({ status: 200, description: "已吊销的 key" })
  revoke(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.transition(id, "revoked", user);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ summary: "物理删除 key" })
  @SwaggerResponse({ status: 200, description: "已删除" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<null>> {
    await this.deleteUc.execute(id);
    await this.audit.execute({
      actorType: "user",
      actorId: user.id,
      action: AUDIT_ACTIONS.apiKey.delete,
      targetType: "api_key",
      targetId: id,
      result: "succeeded",
      requestId: currentRequestId(),
    });
    return { success: true, data: null };
  }
}

/** Domain ApiKey → ApiKeyVo (never plaintext/hash — FR-003). */
function toApiKeyVo(key: ApiKey): ApiKeyVo {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    status: key.status,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
  };
}
