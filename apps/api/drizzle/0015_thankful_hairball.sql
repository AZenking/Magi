-- Older revisions inserted a new publication row for every refresh. Keep the
-- newest row per logical scope before enforcing the one-row publication
-- invariant required by atomic upsert.
DELETE FROM "output_publications" AS older
USING "output_publications" AS newer
WHERE older."scope" = newer."scope"
  AND (
    older."updated_at" < newer."updated_at"
    OR (
      older."updated_at" = newer."updated_at"
      AND older."id" < newer."id"
    )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "output_publications_scope_idx" ON "output_publications" USING btree ("scope");
