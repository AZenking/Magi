import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "drizzle/0006_dear_spencer_smythe.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  join(process.cwd(), "drizzle/0007_curly_gorgon.sql"),
  "utf8",
);
const automaticRegistrationMigration = readFileSync(
  join(process.cwd(), "drizzle/0008_mushy_pepper_potts.sql"),
  "utf8",
);

describe("device-client migration safety", () => {
  it("creates device tables and leaves better-auth tables untouched", () => {
    expect(migration).toContain('CREATE TABLE "device_clients"');
    expect(migration).toContain('CREATE TABLE "device_authorization_grants"');
    expect(migration).toContain('CREATE TABLE "device_refresh_tokens"');
    expect(migration).not.toMatch(/CREATE TABLE "(?:user|session|account|verification)"/);
  });

  it("keeps ownership/token foreign keys, checks, and indexes", () => {
    expect(migration).toContain("device_clients_owner_user_id_user_id_fk");
    expect(migration).toContain("oauth_access_tokens_device_client_id_device_clients_id_fk");
    expect(migration).toContain("device_clients_status_check");
    expect(migration).toContain("device_refresh_tokens_family_generation_idx");
    expect(migration).toContain("oauth_clients_kind_secret_check");
  });

  it("hardens grant status, refresh lineage, and token/device invariants", () => {
    expect(hardeningMigration).toContain(
      "device_authorization_grants_status_check",
    );
    expect(hardeningMigration).toContain(
      "device_authorization_grants_device_client_idx",
    );
    expect(hardeningMigration).toContain(
      "device_refresh_tokens_replaced_by_id_device_refresh_tokens_id_fk",
    );
    expect(hardeningMigration).toContain(
      "device_refresh_tokens_generation_check",
    );
    expect(hardeningMigration).toContain(
      "oauth_tokens_grant_device_consistency_check",
    );
  });

  it("adds a stable installation key for automatic TV registration", () => {
    expect(automaticRegistrationMigration).toContain(
      'ADD COLUMN "installation_id" varchar(64)',
    );
    expect(automaticRegistrationMigration).toContain(
      "device_clients_oauth_installation_idx",
    );
  });
});
