import { Module } from "@nestjs/common";
import { BackupController } from "./backup.controller";

@Module({
  controllers: [BackupController],
})
export class BackupAuditModule {}
