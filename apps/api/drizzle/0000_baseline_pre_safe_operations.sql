CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m3u_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"headers" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"role" varchar(20) DEFAULT 'primary' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"participate_in_output" boolean DEFAULT true NOT NULL,
	"allow_fallback" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"quality_score" real,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" varchar(20),
	"last_check_at" timestamp with time zone,
	"check_status" varchar(20),
	"check_response_time" integer,
	"check_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmltv_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"headers" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"role" varchar(20) DEFAULT 'primary' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"participate_in_output" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"quality_score" real,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" varchar(20),
	"last_check_at" timestamp with time zone,
	"check_status" varchar(20),
	"check_response_time" integer,
	"check_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_m3u_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"tvg_id" varchar(255),
	"tvg_name" varchar(255),
	"tvg_logo" text,
	"group_title" varchar(255),
	"display_name" varchar(255) NOT NULL,
	"stream_url" text NOT NULL,
	"channel_identity" varchar(512) NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"disappeared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_xmltv_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"xmltv_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"icon" text,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"xmltv_channel_id" varchar(255) NOT NULL,
	"title" varchar(512),
	"sub_title" varchar(512),
	"desc" text,
	"category" varchar(255),
	"start_at" timestamp with time zone NOT NULL,
	"stop_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_identity" varchar(512) NOT NULL,
	"m3u_source_id" uuid,
	"raw_channel_id" uuid,
	"display_name" varchar(255) NOT NULL,
	"group_title" varchar(255),
	"tvg_id" varchar(255),
	"tvg_logo" text,
	"stream_url" text,
	"epg_channel_id" varchar(255),
	"epg_match_type" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"stream_status" varchar(20),
	"stream_response_time" integer,
	"stream_checked_at" timestamp with time zone,
	"stream_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_channel_identity_unique" UNIQUE("channel_identity")
);
--> statement-breakpoint
CREATE TABLE "channel_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"custom_name" varchar(255),
	"custom_group" varchar(255),
	"custom_logo" text,
	"channel_number" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"manual_epg_channel_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_overrides_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "canonical_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_name" varchar(255) NOT NULL,
	"standard_group" varchar(255),
	"standard_logo" text,
	"channel_number" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"epg_channel_id" varchar(255),
	"epg_match_type" varchar(30),
	"epg_status" varchar(30),
	"output_status" varchar(20),
	"quality_score" real,
	"primary_stream_id" uuid,
	"merged_from_ids" text,
	"merge_method" varchar(20),
	"conflict_note" text,
	"last_merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_channel_id" uuid NOT NULL,
	"m3u_source_id" uuid,
	"raw_channel_id" uuid,
	"source_channel_id" uuid,
	"stream_url" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"health_status" varchar(20) DEFAULT 'unknown' NOT NULL,
	"response_time" integer,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"success_rate" real,
	"stream_error" text,
	"stream_codec" varchar(50),
	"stream_format" varchar(50),
	"stream_width" integer,
	"stream_height" integer,
	"stream_frame_rate" real,
	"stream_bitrate" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(10) NOT NULL,
	"task_type" varchar(20) DEFAULT 'sync' NOT NULL,
	"source_id" uuid,
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
	"queue_name" varchar(50),
	"job_id" varchar(50),
	"job_name" varchar(50),
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"processed_on" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_m3u_channels" ADD CONSTRAINT "raw_m3u_channels_source_id_m3u_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."m3u_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_xmltv_channels" ADD CONSTRAINT "raw_xmltv_channels_source_id_xmltv_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."xmltv_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_source_id_xmltv_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."xmltv_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_m3u_source_id_m3u_sources_id_fk" FOREIGN KEY ("m3u_source_id") REFERENCES "public"."m3u_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_raw_channel_id_raw_m3u_channels_id_fk" FOREIGN KEY ("raw_channel_id") REFERENCES "public"."raw_m3u_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD CONSTRAINT "channel_overrides_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_canonical_channel_id_canonical_channels_id_fk" FOREIGN KEY ("canonical_channel_id") REFERENCES "public"."canonical_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_m3u_source_id_m3u_sources_id_fk" FOREIGN KEY ("m3u_source_id") REFERENCES "public"."m3u_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_raw_channel_id_raw_m3u_channels_id_fk" FOREIGN KEY ("raw_channel_id") REFERENCES "public"."raw_m3u_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD CONSTRAINT "channel_streams_source_channel_id_channels_id_fk" FOREIGN KEY ("source_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_m3u_source_idx" ON "raw_m3u_channels" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_m3u_identity_idx" ON "raw_m3u_channels" USING btree ("source_id","channel_identity");--> statement-breakpoint
CREATE INDEX "raw_xmltv_source_idx" ON "raw_xmltv_channels" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "programmes_channel_idx" ON "programmes" USING btree ("xmltv_channel_id");--> statement-breakpoint
CREATE INDEX "programmes_time_idx" ON "programmes" USING btree ("start_at","stop_at");--> statement-breakpoint
CREATE INDEX "programmes_source_idx" ON "programmes" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "channels_m3u_source_idx" ON "channels" USING btree ("m3u_source_id");--> statement-breakpoint
CREATE INDEX "canonical_name_idx" ON "canonical_channels" USING btree ("standard_name");--> statement-breakpoint
CREATE INDEX "canonical_group_idx" ON "canonical_channels" USING btree ("standard_group");--> statement-breakpoint
CREATE INDEX "canonical_epg_status_idx" ON "canonical_channels" USING btree ("epg_status");--> statement-breakpoint
CREATE INDEX "canonical_output_status_idx" ON "canonical_channels" USING btree ("output_status");--> statement-breakpoint
CREATE INDEX "channel_streams_canonical_idx" ON "channel_streams" USING btree ("canonical_channel_id");--> statement-breakpoint
CREATE INDEX "channel_streams_source_idx" ON "channel_streams" USING btree ("m3u_source_id");--> statement-breakpoint
CREATE INDEX "channel_streams_health_idx" ON "channel_streams" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "sync_logs_source_idx" ON "sync_logs" USING btree ("source_id","source_type");--> statement-breakpoint
CREATE INDEX "sync_logs_status_idx" ON "sync_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_logs_queue_name_idx" ON "sync_logs" USING btree ("queue_name");