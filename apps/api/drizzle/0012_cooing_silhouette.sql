CREATE TABLE "merge_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_channel_id" uuid NOT NULL,
	"canonical_channel_id" uuid,
	"method" varchar(40) NOT NULL,
	"reasons" text DEFAULT '{}' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"source_fingerprint" varchar(80) NOT NULL,
	"suppression_key" varchar(255),
	"confidence" real,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(255),
	"review_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_health_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"canonical_channel_id" uuid NOT NULL,
	"source" varchar(30) NOT NULL,
	"result" varchar(20) NOT NULL,
	"error_class" varchar(60),
	"latency_ms" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"task_id" uuid,
	"device_client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failover_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_channel_id" uuid NOT NULL,
	"previous_stream_id" uuid,
	"next_stream_id" uuid NOT NULL,
	"trigger" varchar(40) NOT NULL,
	"reason" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observed_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "output_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"device_client_id" uuid,
	"profile" varchar(20) DEFAULT 'primary' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"token_prefix" varchar(32) NOT NULL,
	"token_hash" varchar(120) NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "output_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(40) DEFAULT 'primary' NOT NULL,
	"revision" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'fresh' NOT NULL,
	"published_at" timestamp with time zone,
	"channel_count" integer DEFAULT 0 NOT NULL,
	"playable_channel_count" integer DEFAULT 0 NOT NULL,
	"excluded_channel_count" integer DEFAULT 0 NOT NULL,
	"blocking_reason" text,
	"last_apply_change_set_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_m3u_channels" ADD COLUMN "source_presence" varchar(20) DEFAULT 'present' NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_m3u_channels" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raw_m3u_channels" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "consecutive_successes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "failing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "cooldown_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operation_change_sets" ADD COLUMN "requires_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "operation_change_sets" ADD COLUMN "source_version" integer;--> statement-breakpoint
ALTER TABLE "operation_change_sets" ADD COLUMN "anomaly_classification" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "merge_candidate_suppression_idx" ON "merge_candidates" USING btree ("suppression_key");--> statement-breakpoint
CREATE INDEX "merge_candidate_status_idx" ON "merge_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merge_candidate_source_idx" ON "merge_candidates" USING btree ("source_channel_id");--> statement-breakpoint
CREATE INDEX "merge_candidate_canonical_idx" ON "merge_candidates" USING btree ("canonical_channel_id");--> statement-breakpoint
CREATE INDEX "health_observation_stream_idx" ON "stream_health_observations" USING btree ("stream_id","observed_at");--> statement-breakpoint
CREATE INDEX "health_observation_canonical_idx" ON "stream_health_observations" USING btree ("canonical_channel_id","observed_at");--> statement-breakpoint
CREATE INDEX "health_observation_source_idx" ON "stream_health_observations" USING btree ("source","observed_at");--> statement-breakpoint
CREATE INDEX "failover_event_canonical_idx" ON "failover_events" USING btree ("canonical_channel_id","observed_at");--> statement-breakpoint
CREATE INDEX "failover_event_trigger_idx" ON "failover_events" USING btree ("trigger","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "output_grant_token_hash_idx" ON "output_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "output_grant_owner_idx" ON "output_grants" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "output_grant_device_idx" ON "output_grants" USING btree ("device_client_id");--> statement-breakpoint
CREATE INDEX "raw_m3u_presence_idx" ON "raw_m3u_channels" USING btree ("source_id","source_presence");--> statement-breakpoint
CREATE INDEX "raw_m3u_missing_since_idx" ON "raw_m3u_channels" USING btree ("missing_since");--> statement-breakpoint
CREATE INDEX "channel_streams_missing_since_idx" ON "channel_streams" USING btree ("missing_since");--> statement-breakpoint
CREATE INDEX "change_set_source_confirmation_idx" ON "operation_change_sets" USING btree ("source_id","requires_confirmation");