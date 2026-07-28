import { Module } from "@nestjs/common";
import { BackupController } from "./backup.controller";
import { AuditController } from "../audit/audit.controller";

@Module({
  controllers: [BackupController, AuditController],
})
export class BackupAuditModule {}
