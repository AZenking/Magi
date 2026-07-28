CREATE TABLE "source_import_snapshot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"channel_identity" varchar(255) NOT NULL,
	"collision_ordinal" integer DEFAULT 0 NOT NULL,
	"item_order" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"checksum" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_import_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"source_type" varchar(10) NOT NULL,
	"content_fingerprint" varchar(80) NOT NULL,
	"source_version" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"parser_version" varchar(30) NOT NULL,
	"prepared_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_change_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid,
	"channel_identity" varchar(255),
	"action" varchar(20) NOT NULL,
	"classification" varchar(30),
	"before" jsonb,
	"after" jsonb,
	"changed_fields" jsonb,
	"confidence" real,
	"reason_code" varchar(60),
	"selected" boolean DEFAULT false NOT NULL,
	"decision" jsonb,
	"item_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(40) NOT NULL,
	"status" varchar(20) NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"scope_id" uuid NOT NULL,
	"source_id" uuid,
	"snapshot_id" uuid,
	"input_fingerprint" varchar(80) NOT NULL,
	"base_versions" jsonb NOT NULL,
	"summary" jsonb,
	"warnings" jsonb,
	"blockers" jsonb,
	"requested_by" varchar(255) NOT NULL,
	"prepare_task_id" uuid,
	"apply_task_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_leases" (
	"scope_key" varchar(120) PRIMARY KEY NOT NULL,
	"operation_kind" varchar(40) NOT NULL,
	"task_id" uuid,
	"change_set_id" uuid,
	"acquired_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_point_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recovery_point_id" uuid NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid,
	"entity_version" integer,
	"payload" jsonb NOT NULL,
	"item_order" integer NOT NULL,
	"checksum" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) NOT NULL,
	"operation_kind" varchar(40) NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"scope_id" uuid NOT NULL,
	"change_set_id" uuid,
	"task_id" uuid,
	"schema_version" integer NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"checksum" varchar(80) NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"result" varchar(20) NOT NULL,
	"request_id" varchar(120),
	"task_id" uuid,
	"parent_task_id" uuid,
	"change_set_id" uuid,
	"recovery_point_id" uuid,
	"summary" jsonb,
	"reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" varchar(60) NOT NULL,
	"aggregate_type" varchar(40) NOT NULL,
	"aggregate_id" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"request_id" varchar(120),
	"task_id" uuid,
	"status" varchar(20) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"command" varchar(60) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_fingerprint" varchar(80) NOT NULL,
	"response_status" integer,
	"response_ref" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_channel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_channel_id" uuid NOT NULL,
	"source_channel_id" uuid NOT NULL,
	"channel_identity" varchar(255) NOT NULL,
	"membership_source" varchar(20) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_channel_identity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"alias" varchar(255) NOT NULL,
	"alias_type" varchar(20) NOT NULL,
	"source_channel_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_job_configs" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"task_type" varchar(40) NOT NULL,
	"scope_type" varchar(20),
	"scope_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"interval_ms" integer,
	"cron_expression" varchar(120),
	"time_zone" varchar(60) NOT NULL,
	"overlap_policy" varchar(20) DEFAULT 'skip' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" varchar(20),
	"last_skip_reason" varchar(120),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) NOT NULL,
	"format_version" integer NOT NULL,
	"source_app_version" varchar(60),
	"scope" jsonb NOT NULL,
	"capabilities" jsonb NOT NULL,
	"object_counts" jsonb NOT NULL,
	"checksum" varchar(80) NOT NULL,
	"storage_ref" varchar(500) NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"task_id" uuid
);
--> statement-breakpoint
CREATE TABLE "channel_failover_policies" (
	"canonical_channel_id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(30) DEFAULT 'manual_only' NOT NULL,
	"failure_threshold" integer DEFAULT 3 NOT NULL,
	"recovery_threshold" integer DEFAULT 2 NOT NULL,
	"cooldown_seconds" integer DEFAULT 0 NOT NULL,
	"last_switch_at" timestamp with time zone,
	"last_switch_reason" varchar(500),
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "m3u_sources" ADD COLUMN "freshness_threshold_minutes" integer DEFAULT 1440 NOT NULL;--> statement-breakpoint
ALTER TABLE "m3u_sources" ADD COLUMN "last_content_fingerprint" varchar(80);--> statement-breakpoint
ALTER TABLE "m3u_sources" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "xmltv_sources" ADD COLUMN "freshness_threshold_minutes" integer DEFAULT 1440 NOT NULL;--> statement-breakpoint
ALTER TABLE "xmltv_sources" ADD COLUMN "last_content_fingerprint" varchar(80);--> statement-breakpoint
ALTER TABLE "xmltv_sources" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "source_presence" varchar(20) DEFAULT 'present';--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "first_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "source_revision" varchar(80);--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD COLUMN "manual_epg_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD COLUMN "manual_epg_source_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD COLUMN "decision_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "lifecycle" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "lifecycle_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "stable_key" varchar(255);--> statement-breakpoint
ALTER TABLE "canonical_channels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "origin" varchar(20) DEFAULT 'source';--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "eligible_for_failover" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_streams" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_import_snapshot_items" ADD CONSTRAINT "source_import_snapshot_items_snapshot_id_source_import_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_import_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_change_items" ADD CONSTRAINT "operation_change_items_change_set_id_operation_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."operation_change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_change_sets" ADD CONSTRAINT "operation_change_sets_snapshot_id_source_import_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_import_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_point_items" ADD CONSTRAINT "recovery_point_items_recovery_point_id_recovery_points_id_fk" FOREIGN KEY ("recovery_point_id") REFERENCES "public"."recovery_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_item_identity_idx" ON "source_import_snapshot_items" USING btree ("snapshot_id","channel_identity","collision_ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_item_order_idx" ON "source_import_snapshot_items" USING btree ("snapshot_id","item_order");--> statement-breakpoint
CREATE INDEX "snapshot_item_snapshot_idx" ON "source_import_snapshot_items" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_source_fingerprint_idx" ON "source_import_snapshots" USING btree ("source_id","content_fingerprint");--> statement-breakpoint
CREATE INDEX "snapshot_source_idx" ON "source_import_snapshots" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "snapshot_status_idx" ON "source_import_snapshots" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "change_item_order_idx" ON "operation_change_items" USING btree ("change_set_id","item_order");--> statement-breakpoint
CREATE INDEX "change_item_set_idx" ON "operation_change_items" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "change_item_action_idx" ON "operation_change_items" USING btree ("change_set_id","action");--> statement-breakpoint
CREATE INDEX "change_item_classification_idx" ON "operation_change_items" USING btree ("change_set_id","classification");--> statement-breakpoint
CREATE INDEX "change_set_scope_idx" ON "operation_change_sets" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "change_set_status_idx" ON "operation_change_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "change_set_kind_idx" ON "operation_change_sets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "change_set_requested_by_idx" ON "operation_change_sets" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "operation_lease_expires_idx" ON "operation_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "recovery_item_point_idx" ON "recovery_point_items" USING btree ("recovery_point_id");--> statement-breakpoint
CREATE INDEX "recovery_point_scope_idx" ON "recovery_points" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "recovery_point_change_set_idx" ON "recovery_points" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "recovery_point_status_idx" ON "recovery_points" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_result_idx" ON "audit_events" USING btree ("result");--> statement-breakpoint
CREATE INDEX "audit_task_idx" ON "audit_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "audit_change_set_idx" ON "audit_events" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "audit_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_task_idx" ON "outbox_events" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_command_key_idx" ON "idempotency_records" USING btree ("actor_id","command","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_member_pair_idx" ON "canonical_channel_members" USING btree ("canonical_channel_id","source_channel_id");--> statement-breakpoint
CREATE INDEX "canonical_member_active_source_idx" ON "canonical_channel_members" USING btree ("source_channel_id","active");--> statement-breakpoint
CREATE INDEX "canonical_member_canonical_idx" ON "canonical_channel_members" USING btree ("canonical_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_alias_source_alias_active_idx" ON "source_channel_identity_aliases" USING btree ("source_id","alias","active");--> statement-breakpoint
CREATE INDEX "identity_alias_source_idx" ON "source_channel_identity_aliases" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "identity_alias_target_idx" ON "source_channel_identity_aliases" USING btree ("source_channel_id");--> statement-breakpoint
CREATE INDEX "schedule_task_type_idx" ON "scheduled_job_configs" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "schedule_scope_idx" ON "scheduled_job_configs" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "schedule_enabled_next_run_idx" ON "scheduled_job_configs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "backup_status_idx" ON "config_backups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "backup_expires_idx" ON "config_backups" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "failover_policy_canonical_idx" ON "channel_failover_policies" USING btree ("canonical_channel_id");--> statement-breakpoint
CREATE INDEX "channels_source_presence_idx" ON "channels" USING btree ("source_presence");--> statement-breakpoint
CREATE INDEX "channels_identity_source_idx" ON "channels" USING btree ("channel_identity","m3u_source_id");--> statement-breakpoint
CREATE INDEX "canonical_lifecycle_idx" ON "canonical_channels" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "canonical_stable_key_idx" ON "canonical_channels" USING btree ("stable_key");--> statement-breakpoint
CREATE INDEX "channel_streams_position_idx" ON "channel_streams" USING btree ("canonical_channel_id","position");--> statement-breakpoint
-- ============================================================================
-- Safe Operations backfill (T020, rollout-runbook G2). All statements are
-- deterministic and idempotent: re-running them is a no-op. DDL above is
-- additive-only (expand); rows created before this migration are normalized
-- here so the new read paths see consistent data.
-- ============================================================================
-- G2.1 lifecycle derivation, precedence disabled → hidden → active. Rows
-- already migrated (lifecycle != 'active') are left untouched.
UPDATE "canonical_channels"
SET "lifecycle" = CASE WHEN "disabled" THEN 'disabled' WHEN "hidden" THEN 'hidden' ELSE 'active' END
WHERE "lifecycle" = 'active' AND ("disabled" OR "hidden");--> statement-breakpoint
-- G2.2 stable membership migration from legacy merged_from_ids JSON. Legacy
-- values may be a JSON array of channelIdentity strings, a bare identity, or
-- (oldest format) a channel UUID; all three resolve against channels.
INSERT INTO "canonical_channel_members"
  ("canonical_channel_id", "source_channel_id", "channel_identity", "membership_source", "active")
SELECT cc."id", ch."id", ch."channel_identity", 'migrated', true
FROM "canonical_channels" cc
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN cc."merged_from_ids" IS NULL OR btrim(cc."merged_from_ids") = '' THEN '[]'::jsonb
    WHEN left(btrim(cc."merged_from_ids"), 1) = '[' THEN cc."merged_from_ids"::jsonb
    ELSE jsonb_build_array(cc."merged_from_ids")
  END
) AS m("identity")
JOIN "channels" ch ON ch."channel_identity" = m."identity" OR ch."id"::text = m."identity"
ON CONFLICT ("canonical_channel_id", "source_channel_id") DO NOTHING;--> statement-breakpoint
-- G2.3 deterministic stream position repair: primary first, then insertion
-- order. Only fills NULL positions so manual ordering is never overwritten.
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "canonical_channel_id"
    ORDER BY "is_primary" DESC, "created_at" ASC, "id" ASC
  ) AS rn
  FROM "channel_streams"
  WHERE "canonical_channel_id" IS NOT NULL
)
UPDATE "channel_streams" cs
SET "position" = ranked.rn
FROM ranked
WHERE cs."id" = ranked."id" AND cs."position" IS NULL;--> statement-breakpoint
-- G2.4a unique-primary repair: demote duplicate primaries, keeping the
-- earliest created (stable) one.
UPDATE "channel_streams" cs
SET "is_primary" = false
WHERE cs."is_primary"
  AND cs."canonical_channel_id" IS NOT NULL
  AND cs."id" <> (
    SELECT p."id" FROM "channel_streams" p
    WHERE p."canonical_channel_id" = cs."canonical_channel_id" AND p."is_primary"
    ORDER BY p."created_at" ASC, p."id" ASC
    LIMIT 1
  );--> statement-breakpoint
-- G2.4b unique-primary repair: promote the earliest stream when a channel has
-- streams but no primary at all.
UPDATE "channel_streams" cs
SET "is_primary" = true
WHERE cs."canonical_channel_id" IS NOT NULL
  AND cs."id" = (
    SELECT p."id" FROM "channel_streams" p
    WHERE p."canonical_channel_id" = cs."canonical_channel_id"
    ORDER BY p."created_at" ASC, p."id" ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "channel_streams" p
    WHERE p."canonical_channel_id" = cs."canonical_channel_id" AND p."is_primary"
  );--> statement-breakpoint
-- G2.5 seen-timestamps backfill from audit columns; presence keeps the
-- 'present' default because the legacy path deleted missing source channels.
UPDATE "channels"
SET "first_seen_at" = COALESCE("first_seen_at", "created_at"),
    "last_seen_at"  = COALESCE("last_seen_at", "updated_at", "created_at")
WHERE "first_seen_at" IS NULL OR "last_seen_at" IS NULL;
