import { Global, Module } from "@nestjs/common";
import { AppendAuditEventUseCase } from "@/application/audit/append-audit-event.use-case";
import { AuditEventRepository } from "@/infrastructure/database/audit-event.repository";
import { AuditEventWriterRepository } from "@/infrastructure/database/audit-event-writer.repository";
import { AuditController } from "./audit.controller";

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditEventRepository,
    AuditEventWriterRepository,
    {
      provide: AppendAuditEventUseCase,
      useFactory: (writer: AuditEventWriterRepository) =>
        new AppendAuditEventUseCase(writer),
      inject: [AuditEventWriterRepository],
    },
  ],
  exports: [AppendAuditEventUseCase],
})
export class AuditModule {}
