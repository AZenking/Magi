import { timestamp } from "drizzle-orm/pg-core";

export function createdAt(name = "created_at") {
  return timestamp(name, { withTimezone: true }).defaultNow().notNull();
}

export function updatedAt(name = "updated_at") {
  return timestamp(name, { withTimezone: true }).defaultNow().notNull();
}

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
} as const;
