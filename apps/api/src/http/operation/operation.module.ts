/**
 * Operation HTTP module (T043).
 *
 * Registers the operation controller + the BullMQ queue adapter it depends on.
 */
import { Module } from "@nestjs/common";
import { OperationController } from "./operation.controller";
import { RecoveryController } from "./recovery.controller";
import { BullmqModule } from "@/infrastructure/bullmq/bullmq.module";

@Module({
  imports: [BullmqModule],
  controllers: [OperationController, RecoveryController],
})
export class OperationModule {}
