import { Module } from "@nestjs/common";
import { db } from "./connection";

@Module({
  providers: [
    {
      provide: "DB",
      useValue: db,
    },
  ],
  exports: ["DB"],
})
export class DatabaseModule {}
