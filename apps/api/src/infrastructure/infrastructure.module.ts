import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { RedisModule } from "./redis/redis.module";
import { BullmqModule } from "./bullmq/bullmq.module";

@Module({
  imports: [DatabaseModule, RedisModule, BullmqModule],
  exports: [DatabaseModule, RedisModule, BullmqModule],
})
export class InfrastructureModule {}
