CREATE UNIQUE INDEX IF NOT EXISTS "sync_logs_one_active_per_source"
  ON "sync_logs" ("task_type", "source_id")
  WHERE "status" IN ('pending', 'running');
