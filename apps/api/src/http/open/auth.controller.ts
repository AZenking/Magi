/**
 * AuthController — public OAuth2 device authorization and token grants.
 *
 * The endpoints are public (no AccessTokenGuard) because they establish the
 * bearer credential. ThrottlerGuard limits brute-force and polling attempts.
 *
 * New TV installs use device-register and are assigned to the configured
 * default account. The RFC 8628 endpoints remain available for legacy clients.
 */
import {
  Body,
  Controller,
  Post,
  BadRequestException,
  Header,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
} from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type {
  ApiResponse,
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  TokenResponse,
} from "@magi/types";
import {
  DeviceAuthorizationRequestSchema,
  DeviceRegistrationRequestSchema,
  TokenGrantRequestSchema,
} from "@magi/types";
import { IssueTokenUseCase } from "../../application/oauth/issue-token.use-case";
import { BeginDeviceAuthorizationUseCase } from "../../application/device-client/begin-device-authorization.use-case";
import { ExchangeDeviceCodeUseCase } from "../../application/device-client/exchange-device-code.use-case";
import { RefreshDeviceTokenUseCase } from "../../application/device-client/refresh-device-token.use-case";
import { currentRequestId } from "../../shared/http/request-context.middleware";
import { RegisterDefaultDeviceUseCase } from "../../application/device-client/register-default-device.use-case";

@ApiTags("开放接口")
@UseGuards(ThrottlerGuard) // 10 req/min default — tighter than the data endpoints.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller("api/open/v1/auth")
export class AuthController {
  constructor(
    @Inject(IssueTokenUseCase) private readonly issueToken: IssueTokenUseCase,
    @Inject(ExchangeDeviceCodeUseCase)
    private readonly exchangeDeviceCode: ExchangeDeviceCodeUseCase,
    @Inject(RefreshDeviceTokenUseCase)
    private readonly refreshDeviceToken: RefreshDeviceTokenUseCase,
    @Inject(BeginDeviceAuthorizationUseCase)
    private readonly beginDeviceAuthorization: BeginDeviceAuthorizationUseCase,
    @Inject(RegisterDefaultDeviceUseCase)
    private readonly registerDefaultDevice: RegisterDefaultDeviceUseCase,
  ) {}

  @Post("device-register")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "自动注册电视客户端" })
  @SwaggerResponse({ status: 200, description: "返回设备凭证" })
  async registerDevice(
    @Body() body: unknown,
  ): Promise<ApiResponse<DeviceTokenResponse>> {
    const parsed = DeviceRegistrationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    }
    const result = await this.registerDefaultDevice.execute({
      clientId: parsed.data.client_id,
      installationId: parsed.data.installation_id,
      deviceType: parsed.data.device_type,
      platform: parsed.data.platform,
      platformVersion: parsed.data.platform_version,
      appVersion: parsed.data.app_version,
      identitySummary: parsed.data.identity_summary,
      suggestedName: parsed.data.suggested_name,
      requestId: currentRequestId(),
    });
    return {
      success: true,
      data: {
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
        scope: result.scope,
        refresh_token: result.refreshToken,
        refresh_expires_in: result.refreshExpiresIn,
        device_client_id: result.deviceClientId,
      },
    };
  }

  @Post("device-authorization")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "开始设备授权" })
  @SwaggerResponse({ status: 200, description: "返回电视短码和设备码" })
  async beginDeviceAuthorizationRequest(
    @Body() body: unknown,
  ): Promise<ApiResponse<DeviceAuthorizationResponse>> {
    const parsed = DeviceAuthorizationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "validation-failed",
        detail: parsed.error.flatten(),
      });
    }
    const result = await this.beginDeviceAuthorization.execute({
      clientId: parsed.data.client_id,
      deviceType: parsed.data.device_type,
      platform: parsed.data.platform,
      platformVersion: parsed.data.platform_version,
      appVersion: parsed.data.app_version,
      identitySummary: parsed.data.identity_summary,
      suggestedName: parsed.data.suggested_name,
    });
    return {
      success: true,
      data: {
        device_code: result.deviceCode,
        user_code: result.userCode,
        verification_uri: result.verificationUri,
        verification_uri_complete: result.verificationUriComplete,
        expires_in: result.expiresIn,
        interval: result.interval,
      },
    };
  }

  @Post("token")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "客户端凭证换 Token（Client Credentials Grant）" })
  @SwaggerResponse({ status: 200, description: "签发的 access_token" })
  @SwaggerResponse({
    status: 401,
    description: "凭证无效 / 客户端被禁用或吊销",
  })
  async token(
    @Body() body: unknown,
  ): Promise<ApiResponse<TokenResponse | DeviceTokenResponse>> {
    const parsed = TokenGrantRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "unsupported-grant-type",
        detail: parsed.error.flatten(),
      });
    }
    if (parsed.data.grant_type === "client_credentials") {
      const result = await this.issueToken.execute({
        clientId: parsed.data.client_id,
        clientSecret: parsed.data.client_secret,
      });
      const data: TokenResponse = {
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
        scope: result.scope,
      };
      return { success: true, data };
    }
    const result =
      parsed.data.grant_type === "urn:ietf:params:oauth:grant-type:device_code"
        ? await this.exchangeDeviceCode.execute({
            clientId: parsed.data.client_id,
            deviceCode: parsed.data.device_code,
            requestId: currentRequestId(),
          })
        : await this.refreshDeviceToken.execute({
            clientId: parsed.data.client_id,
            refreshToken: parsed.data.refresh_token,
          });
    const data: DeviceTokenResponse = {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: result.expiresIn,
      scope: result.scope,
      refresh_token: result.refreshToken,
      refresh_expires_in: result.refreshExpiresIn,
      device_client_id: result.deviceClientId,
    };
    return {
      success: true,
      data,
    };
  }
}
