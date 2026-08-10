DROP INDEX IF EXISTS "snapshot_source_fingerprint_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshot_source_fingerprint_idx" ON "source_import_snapshots" USING btree ("source_id","content_fingerprint");
