ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
-- Keep the existing bootstrap account usable immediately after upgrading.
-- Deployments with a different MAGI_ADMIN_USERNAME are synchronized by the
-- seed command and are also accepted by AdminGuard during the transition.
UPDATE "user"
SET "role" = 'admin'
WHERE "username" = 'admin' AND "role" = 'user';
