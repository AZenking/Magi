import { defineConfig } from "drizzle-kit";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../../..");
const sharedSchemaDir = path.join(repoRoot, "packages/backend-core/src/database/schema");

// Point drizzle-kit at the actual pgTable source files rather than at the
// re-export barrel. This avoids `__exportStar` resolution ambiguity that
// triggers interactive rename prompts during `db:generate`.
//
// We list every shared schema file EXPLICITLY (excluding `index.ts`, which only
// re-exports and would cause double-registration). The operational schema source
// of truth is `@magi/backend-core`; `auth` is API-local (better-auth).
// Constitution II (single source) is preserved: API still has zero field
// definitions — it only points at the shared source.
const sharedSchemaTables = [
  "m3u-sources",
  "xmltv-sources",
  "channels",
  "raw-m3u-channels",
  "raw-xmltv-channels",
  "programmes",
  "sync-logs",
  "canonical-channels",
  "channel-overrides",
  "channel-streams",
  "helpers",
  // Safe Operations (T015–T018)
  "source-import-snapshots",
  "operation-change-sets",
  "operation-leases",
  "recovery-points",
  "audit-events",
  "outbox-events",
  "idempotency-records",
  "canonical-channel-members",
  "source-channel-identity-aliases",
  "scheduled-job-configs",
  "config-backups",
  "channel-failover-policies",
].map((f) => path.join(sharedSchemaDir, `${f}.ts`));

export default defineConfig({
  schema: ["./src/infrastructure/database/schema/auth.ts", ...sharedSchemaTables],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://magi:magi@localhost:5432/magi",
  },
});
