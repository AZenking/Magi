-- Fix sync_logs table schema to match current code expectations
-- First, let's check if the table exists and drop it to recreate with correct schema
DROP TABLE IF EXISTS "sync_logs";
--> statement-breakpoint
-- Create sync_logs table with correct schema
CREATE TABLE "sync_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source_type" varchar(10) NOT NULL,
    "task_type" varchar(20) NOT NULL DEFAULT 'sync',
    "source_id" uuid NOT NULL,
    "status" varchar(20) NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone,
    "error" text,
    "progress" integer DEFAULT 0 NOT NULL,
    "current_step" varchar(20),
    "execution_log" text,
    "imported_count" integer DEFAULT 0 NOT NULL,
    "added_count" integer DEFAULT 0 NOT NULL,
    "updated_count" integer DEFAULT 0 NOT NULL,
    "removed_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_logs_source_idx" ON "sync_logs" ("source_id", "source_type");
--> statement-breakpoint
CREATE INDEX "sync_logs_status_idx" ON "sync_logs" ("status");