-- Migrate channel_streams from old schema to new schema
-- Drop old columns
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "source_type";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "source_id";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "quality";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "priority";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "is_active";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "stream_status";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "stream_response_time";
ALTER TABLE "channel_streams" DROP COLUMN IF EXISTS "stream_checked_at";

-- Add new columns
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "m3u_source_id" uuid;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "raw_channel_id" uuid;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "source_channel_id" uuid;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "health_status" varchar(20) DEFAULT 'unknown' NOT NULL;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "response_time" integer;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "last_success_at" timestamp with time zone;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer DEFAULT 0 NOT NULL;
ALTER TABLE "channel_streams" ADD COLUMN IF NOT EXISTS "success_rate" real;

-- Add new indexes
CREATE INDEX IF NOT EXISTS "channel_streams_source_idx" ON "channel_streams" ("m3u_source_id");
CREATE INDEX IF NOT EXISTS "channel_streams_health_idx" ON "channel_streams" ("health_status");

-- Add new foreign keys
ALTER TABLE "channel_streams" DROP CONSTRAINT IF EXISTS "channel_streams_m3u_source_id_fkey";
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_m3u_source_id_m3u_sources_id_fk" FOREIGN KEY ("m3u_source_id") REFERENCES "public"."m3u_sources"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "channel_streams" DROP CONSTRAINT IF EXISTS "channel_streams_raw_channel_id_fkey";
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_raw_channel_id_raw_m3u_channels_id_fk" FOREIGN KEY ("raw_channel_id") REFERENCES "public"."raw_m3u_channels"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "channel_streams" DROP CONSTRAINT IF EXISTS "channel_streams_source_channel_id_fkey";
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_source_channel_id_channels_id_fk" FOREIGN KEY ("source_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;
