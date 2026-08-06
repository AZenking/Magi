CREATE TABLE IF NOT EXISTS "content_manifest" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "catalog_revision" integer DEFAULT 1 NOT NULL,
  "epg_revision" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "content_manifest" ("id", "catalog_revision", "epg_revision")
VALUES (1, 1, 1)
ON CONFLICT ("id") DO NOTHING;
