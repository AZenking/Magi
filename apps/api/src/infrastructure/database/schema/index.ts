export * from "./auth";

import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  icon: text("icon"),
  url: text("url"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  epgSourceId: uuid("epg_source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const programmes = pgTable("programmes", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  start: timestamp("start").notNull(),
  stop: timestamp("stop").notNull(),
  category: varchar("category", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const epgSources = pgTable("epg_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  url: text("url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  progress: text("progress"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
