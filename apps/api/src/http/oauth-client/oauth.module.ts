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
import { AuthController } from "../open/auth.controller";
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

@Module({
  controllers: [AuthController, OauthClientAdminController],
  providers: [
    { provide: OAUTH_CLIENT_REPOSITORY, useClass: OauthClientRepository },
    { provide: ACCESS_TOKEN_REPOSITORY, useClass: AccessTokenRepository },
    AccessTokenGuard,
    IssueTokenUseCase,
    CreateOauthClientUseCase,
    ListOauthClientsUseCase,
    TransitionOauthClientStatusUseCase,
    DeleteOauthClientUseCase,
  ],
  exports: [OAUTH_CLIENT_REPOSITORY, ACCESS_TOKEN_REPOSITORY, AccessTokenGuard],
})
export class OauthModule {}
