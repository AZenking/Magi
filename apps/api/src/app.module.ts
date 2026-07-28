import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "./infrastructure/logger/logger.module";
import { HttpModule } from "./http/http.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { IdempotencyRepository } from "./infrastructure/database/idempotency.repository";
import { ProblemDetailsFilter } from "./shared/http/problem-details.filter";
import { IdempotencyInterceptor } from "./shared/http/idempotency.interceptor";
import { RequestContextMiddleware } from "./shared/http/request-context.middleware";

@Module({
  imports: [LoggerModule, InfrastructureModule, HttpModule],
  providers: [
    IdempotencyRepository,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
