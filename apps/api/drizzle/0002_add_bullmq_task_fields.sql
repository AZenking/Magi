ALTER TABLE "sync_logs" ADD COLUMN "queue_name" varchar(50);
ALTER TABLE "sync_logs" ADD COLUMN "job_id" varchar(50);
ALTER TABLE "sync_logs" ADD COLUMN "job_name" varchar(50);
ALTER TABLE "sync_logs" ADD COLUMN "attempts_made" integer NOT NULL DEFAULT 0;
ALTER TABLE "sync_logs" ADD COLUMN "processed_on" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "sync_logs_queue_name_idx" ON "sync_logs" ("queue_name");
