import { Module } from "@nestjs/common";
import { Queue } from "bullmq";

@Module({
  providers: [
    {
      provide: "XMLTV_QUEUE",
      useFactory: () => {
        return new Queue("xmltv", {
          connection: { host: process.env.REDIS_HOST ?? "localhost", port: Number(process.env.REDIS_PORT) || 6379 },
        });
      },
    },
  ],
  exports: ["XMLTV_QUEUE"],
})
export class BullmqModule {}
