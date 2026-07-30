import { Module } from "@nestjs/common";
import { ApiKeyAdminController } from "./api-key.controller";
import { ApiKeyRepository } from "../../infrastructure/database/api-key.repository";
import { ApiKeyGuard, API_KEY_REPOSITORY } from "../../shared/guards/api-key.guard";
import { CreateApiKeyUseCase } from "../../application/api-key/create-api-key.use-case";
import { ListApiKeysUseCase } from "../../application/api-key/list-api-keys.use-case";
import { TransitionApiKeyStatusUseCase } from "../../application/api-key/transition-api-key-status.use-case";
import { DeleteApiKeyUseCase } from "../../application/api-key/delete-api-key.use-case";

/**
 * ApiKeyModule — wires the API key repository token + management use-cases.
 *
 * The repository token (API_KEY_REPOSITORY) is shared between the management
 * surface (here) and the open API guard (OpenModule). ApiKeyGuard is registered
 * as a provider so OpenModule's controller can @UseGuards(ApiKeyGuard) and have
 * DI resolve its repo dependency.
 */
@Module({
  controllers: [ApiKeyAdminController],
  providers: [
    { provide: API_KEY_REPOSITORY, useClass: ApiKeyRepository },
    ApiKeyGuard,
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    TransitionApiKeyStatusUseCase,
    DeleteApiKeyUseCase,
  ],
  exports: [API_KEY_REPOSITORY, ApiKeyGuard],
})
export class ApiKeyModule {}
