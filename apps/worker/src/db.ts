import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL ?? "postgres://magi:magi@localhost:5432/magi";

const client = postgres(connectionString);
export const db = drizzle(client);
