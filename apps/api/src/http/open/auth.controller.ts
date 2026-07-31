/**
 * AuthController — OAuth2 Client Credentials Grant token endpoint
 * (004-safe-operations).
 *
 * POST /api/open/v1/auth/token exchanges a clientId/clientSecret pair for a
 * short-lived access token. This is a PUBLIC endpoint (no AccessTokenGuard) —
 * it IS the authentication. ThrottlerGuard limits brute-force attempts.
 *
 * Mirrors RFC 6749 §4.4.4 response shape:
 *   { access_token, token_type: "Bearer", expires_in }
 */
import { Body, Controller, Post, BadRequestException, UseGuards, Inject } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { TokenResponse } from "@magi/types";
import { TokenRequestSchema } from "@magi/types";
import { IssueTokenUseCase } from "../../application/oauth/issue-token.use-case";

@ApiTags("开放接口")
@UseGuards(ThrottlerGuard) // 10 req/min default — tighter than the data endpoints.
@Controller("api/open/v1/auth")
export class AuthController {
  constructor(@Inject(IssueTokenUseCase) private readonly issueToken: IssueTokenUseCase) {}

  @Post("token")
  @ApiOperation({ summary: "客户端凭证换 Token（Client Credentials Grant）" })
  @SwaggerResponse({ status: 200, description: "签发的 access_token" })
  @SwaggerResponse({ status: 401, description: "凭证无效 / 客户端被禁用或吊销" })
  async token(@Body() body: unknown): Promise<{ success: true; data: TokenResponse }> {
    const parsed = TokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "unsupported-grant-type",
        detail: parsed.error.flatten(),
      });
    }
    const result = await this.issueToken.execute({
      clientId: parsed.data.client_id,
      clientSecret: parsed.data.client_secret,
    });
    return {
      success: true,
      data: {
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
      },
    };
  }
}
