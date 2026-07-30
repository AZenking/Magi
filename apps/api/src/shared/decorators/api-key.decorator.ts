import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** The authenticated API key attached by ApiKeyGuard (or undefined). */
export interface RequestApiKey {
  id: string;
  name: string;
  keyPrefix: string;
}

/**
 * Extracts the API key resolved by ApiKeyGuard onto `req.apiKey`.
 * Mirrors the @CurrentUser() pattern (session-based) for the Bearer path.
 */
export const ApiKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestApiKey => {
  const req = ctx.switchToHttp().getRequest();
  return req.apiKey;
});
