-- 008-pipeline-reliability T004: add last_playback_report_at column for
-- tracking the most recent client playback report (distinct from
-- last_checked_at which is the worker's active probe time).
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "last_playback_report_at" timestamp with time zone;
