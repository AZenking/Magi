CREATE TABLE "canonical_epg_bindings" (
	"canonical_channel_id" uuid PRIMARY KEY NOT NULL,
	"xmltv_source_id" uuid,
	"xmltv_channel_id" varchar(255),
	"status" varchar(30) DEFAULT 'unmatched' NOT NULL,
	"match_type" varchar(30),
	"locked" boolean DEFAULT false NOT NULL,
	"decision_reason" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_epg_binding_matched_fields_check" CHECK (("canonical_epg_bindings"."status" not in ('matched_manual', 'matched_auto')) or ("canonical_epg_bindings"."xmltv_source_id" is not null and "canonical_epg_bindings"."xmltv_channel_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "canonical_epg_bindings" ADD CONSTRAINT "canonical_epg_bindings_canonical_channel_id_canonical_channels_id_fk" FOREIGN KEY ("canonical_channel_id") REFERENCES "public"."canonical_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_epg_bindings" ADD CONSTRAINT "canonical_epg_bindings_xmltv_source_id_xmltv_sources_id_fk" FOREIGN KEY ("xmltv_source_id") REFERENCES "public"."xmltv_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canonical_epg_binding_source_channel_idx" ON "canonical_epg_bindings" USING btree ("xmltv_source_id","xmltv_channel_id");--> statement-breakpoint
CREATE INDEX "canonical_epg_binding_status_idx" ON "canonical_epg_bindings" USING btree ("status");--> statement-breakpoint
-- Prefer explicit manual bindings whose source was recorded on a source-channel
-- override. DISTINCT ON keeps this idempotent for merged canonical channels.
INSERT INTO "canonical_epg_bindings" (
	"canonical_channel_id",
	"xmltv_source_id",
	"xmltv_channel_id",
	"status",
	"match_type",
	"locked",
	"decision_reason"
)
SELECT DISTINCT ON (m."canonical_channel_id")
	m."canonical_channel_id",
	o."manual_epg_source_id",
	o."manual_epg_channel_id",
	'matched_manual',
	'manual',
	o."manual_epg_locked",
	o."decision_reason"
FROM "canonical_channel_members" m
JOIN "channel_overrides" o ON o."channel_id" = m."source_channel_id"
WHERE o."manual_epg_source_id" IS NOT NULL
	AND o."manual_epg_channel_id" IS NOT NULL
ORDER BY m."canonical_channel_id", o."updated_at" DESC
ON CONFLICT ("canonical_channel_id") DO NOTHING;--> statement-breakpoint
-- Backfill legacy canonical bindings only when the upstream XMLTV source is
-- unambiguous. Source-qualified lookup prevents programmes from different
-- providers sharing the same XMLTV id from being mixed.
WITH candidates AS (
	SELECT
		c."id" AS canonical_channel_id,
		c."epg_channel_id" AS xmltv_channel_id,
		min(r."source_id"::text)::uuid AS xmltv_source_id,
		count(DISTINCT r."source_id") AS source_count,
		c."epg_status",
		c."epg_match_type"
	FROM "canonical_channels" c
	JOIN "raw_xmltv_channels" r ON r."xmltv_id" = c."epg_channel_id"
	WHERE c."epg_channel_id" IS NOT NULL
	GROUP BY c."id", c."epg_channel_id", c."epg_status", c."epg_match_type"
)
INSERT INTO "canonical_epg_bindings" (
	"canonical_channel_id",
	"xmltv_source_id",
	"xmltv_channel_id",
	"status",
	"match_type",
	"locked"
)
SELECT
	candidates.canonical_channel_id,
	CASE WHEN candidates.source_count = 1 THEN candidates.xmltv_source_id ELSE NULL END,
	candidates.xmltv_channel_id,
	CASE
		WHEN candidates.source_count > 1 THEN 'conflict'
		WHEN candidates.epg_status = 'matched_manual' THEN 'matched_manual'
		ELSE 'matched_auto'
	END,
	CASE WHEN candidates.source_count > 1 THEN 'conflict' ELSE candidates.epg_match_type END,
	false
FROM candidates
ON CONFLICT ("canonical_channel_id") DO NOTHING;--> statement-breakpoint
-- Every canonical channel receives a row, making unmatched state explicit.
INSERT INTO "canonical_epg_bindings" (
	"canonical_channel_id",
	"status",
	"locked"
)
SELECT c."id", 'unmatched', false
FROM "canonical_channels" c
ON CONFLICT ("canonical_channel_id") DO NOTHING;
