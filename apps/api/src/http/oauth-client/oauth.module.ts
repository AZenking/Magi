/**
 * OauthModule — wires the OAuth2 Client Credentials Grant infrastructure.
 *
 * Provides:
 *   - OAUTH_CLIENT_REPOSITORY + ACCESS_TOKEN_REPOSITORY tokens (shared between
 *     the management surface, the token endpoint, and the AccessTokenGuard)
 *   - AccessTokenGuard (registered so OpenModule can @UseGuards(AccessTokenGuard))
 *   - IssueTokenUseCase (token endpoint)
 *   - Client management use-cases (create / list / transition / delete)
 *   - AuthController (POST /api/open/v1/auth/token)
 *   - OauthClientAdminController (admin CRUD + disable/enable/revoke)
 */
import { Module } from "@nestjs/common";
import { OauthClientAdminController } from "./oauth-client.controller";
import { OauthClientRepository } from "../../infrastructure/database/oauth-client.repository";
import { AccessTokenRepository } from "../../infrastructure/database/access-token.repository";
import { AccessTokenGuard } from "../../shared/guards/access-token.guard";
import {
  OAUTH_CLIENT_REPOSITORY,
  ACCESS_TOKEN_REPOSITORY,
} from "@/domain/oauth";
import { IssueTokenUseCase } from "../../application/oauth/issue-token.use-case";
import { CreateOauthClientUseCase } from "../../application/oauth/create-oauth-client.use-case";
import { ListOauthClientsUseCase } from "../../application/oauth/list-oauth-clients.use-case";
import { TransitionOauthClientStatusUseCase } from "../../application/oauth/transition-oauth-client-status.use-case";
import { DeleteOauthClientUseCase } from "../../application/oauth/delete-oauth-client.use-case";
import { DeviceClientRepositoryImpl } from "../../infrastructure/database/device-client.repository";
import {
  DEFAULT_DEVICE_OWNER_REPOSITORY,
  DEVICE_CLIENT_REPOSITORY,
} from "@/domain/device-client";
import { DefaultDeviceOwnerRepository } from "../../infrastructure/database/default-device-owner.repository";
import { BeginDeviceAuthorizationUseCase } from "../../application/device-client/begin-device-authorization.use-case";
import { InspectDeviceAuthorizationUseCase } from "../../application/device-client/inspect-device-authorization.use-case";
import { DecideDeviceAuthorizationUseCase } from "../../application/device-client/decide-device-authorization.use-case";
import { ExchangeDeviceCodeUseCase } from "../../application/device-client/exchange-device-code.use-case";
import { RefreshDeviceTokenUseCase } from "../../application/device-client/refresh-device-token.use-case";
import { ListDeviceClientsUseCase } from "../../application/device-client/list-device-clients.use-case";
import { RecordHeartbeatUseCase } from "../../application/device-client/record-heartbeat.use-case";
import { RenameDeviceClientUseCase } from "../../application/device-client/rename-device-client.use-case";
import { RevokeDeviceClientUseCase } from "../../application/device-client/revoke-device-client.use-case";
import { RegisterDefaultDeviceUseCase } from "../../application/device-client/register-default-device.use-case";
import { ContentManifestRepository } from "../../infrastructure/database/content-manifest.repository";
import { CONTENT_MANIFEST_REPOSITORY } from "@/domain/content";

@Module({
  controllers: [OauthClientAdminController],
  providers: [
    { provide: OAUTH_CLIENT_REPOSITORY, useClass: OauthClientRepository },
    { provide: ACCESS_TOKEN_REPOSITORY, useClass: AccessTokenRepository },
    { provide: DEVICE_CLIENT_REPOSITORY, useClass: DeviceClientRepositoryImpl },
    {
      provide: DEFAULT_DEVICE_OWNER_REPOSITORY,
      useClass: DefaultDeviceOwnerRepository,
    },
    AccessTokenGuard,
    IssueTokenUseCase,
    CreateOauthClientUseCase,
    ListOauthClientsUseCase,
    TransitionOauthClientStatusUseCase,
    DeleteOauthClientUseCase,
    BeginDeviceAuthorizationUseCase,
    InspectDeviceAuthorizationUseCase,
    DecideDeviceAuthorizationUseCase,
    ExchangeDeviceCodeUseCase,
    RefreshDeviceTokenUseCase,
    ListDeviceClientsUseCase,
    RecordHeartbeatUseCase,
    RenameDeviceClientUseCase,
    RevokeDeviceClientUseCase,
    RegisterDefaultDeviceUseCase,
    { provide: CONTENT_MANIFEST_REPOSITORY, useClass: ContentManifestRepository },
  ],
  exports: [
    OAUTH_CLIENT_REPOSITORY,
    ACCESS_TOKEN_REPOSITORY,
    DEVICE_CLIENT_REPOSITORY,
    AccessTokenGuard,
    IssueTokenUseCase,
    BeginDeviceAuthorizationUseCase,
    InspectDeviceAuthorizationUseCase,
    DecideDeviceAuthorizationUseCase,
    ExchangeDeviceCodeUseCase,
    RefreshDeviceTokenUseCase,
    ListDeviceClientsUseCase,
    RecordHeartbeatUseCase,
    RenameDeviceClientUseCase,
    RevokeDeviceClientUseCase,
    RegisterDefaultDeviceUseCase,
    CONTENT_MANIFEST_REPOSITORY,
  ],
})
export class OauthModule {}
