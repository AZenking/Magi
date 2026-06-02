import { Module } from "@nestjs/common";
import Redis from "ioredis";

@Module({
  providers: [
    {
      provide: "REDIS",
      useFactory: () => {
        return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
      },
    },
  ],
  exports: ["REDIS"],
})
export class RedisModule {}
