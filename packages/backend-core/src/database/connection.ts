import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(connectionString?: string) {
  const client = postgres(connectionString ?? process.env.DATABASE_URL ?? "postgres://magi:magi@localhost:5432/magi");
  return drizzle(client);
}
