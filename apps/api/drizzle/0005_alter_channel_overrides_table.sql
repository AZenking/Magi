-- Migrate channel_overrides from key-value schema to typed column schema
-- Drop old columns and constraints
ALTER TABLE "channel_overrides" DROP CONSTRAINT IF EXISTS "channel_overrides_channel_id_fkey";
ALTER TABLE "channel_overrides" DROP COLUMN IF EXISTS "override_field";
ALTER TABLE "channel_overrides" DROP COLUMN IF EXISTS "override_value";

-- Add new typed columns
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "custom_name" varchar(255);
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "custom_group" varchar(255);
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "custom_logo" text;
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "channel_number" integer;
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "starred" boolean DEFAULT false NOT NULL;
ALTER TABLE "channel_overrides" ADD COLUMN IF NOT EXISTS "manual_epg_channel_id" varchar(255);

-- Make channel_id unique (Drizzle schema uses .unique())
CREATE UNIQUE INDEX IF NOT EXISTS "channel_overrides_channel_id_unique" ON "channel_overrides" ("channel_id");

-- Add FK to channels table (raw channels) instead of canonical_channels
-- First check if any data references canonical_channels — if so we may need to adjust
-- For now, add the FK pointing to channels
ALTER TABLE "channel_overrides" ADD CONSTRAINT "channel_overrides_channel_id_channels_id_fk"
  FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
