CREATE TABLE "device_authorization_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oauth_client_id" uuid NOT NULL,
	"device_code_hash" varchar(64) NOT NULL,
	"user_code_digest" varchar(64) NOT NULL,
	"device_type" varchar(32) NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_version" varchar(64) NOT NULL,
	"app_version" varchar(64) NOT NULL,
	"identity_summary" varchar(120) NOT NULL,
	"requested_display_name" varchar(64),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"owner_user_id" text,
	"approved_display_name" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"poll_interval_seconds" integer DEFAULT 5 NOT NULL,
	"last_polled_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"device_client_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"oauth_client_id" uuid NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"device_type" varchar(32) NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_version" varchar(64) NOT NULL,
	"app_version" varchar(64) NOT NULL,
	"identity_summary" varchar(120) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_clients_status_check" CHECK (("device_clients"."status" = 'active' AND "device_clients"."revoked_at" IS NULL AND "device_clients"."revoked_by" IS NULL)
        OR ("device_clients"."status" = 'revoked' AND "device_clients"."revoked_at" IS NOT NULL AND "device_clients"."revoked_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "device_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_client_id" uuid NOT NULL,
	"oauth_client_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(12) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "secret_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "secret_prefix" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_kind" varchar(20) DEFAULT 'confidential' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "device_client_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "grant_type" varchar(64) DEFAULT 'client_credentials' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "scope" varchar(255) DEFAULT 'open:read' NOT NULL;--> statement-breakpoint
ALTER TABLE "device_authorization_grants" ADD CONSTRAINT "device_authorization_grants_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_authorization_grants" ADD CONSTRAINT "device_authorization_grants_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_authorization_grants" ADD CONSTRAINT "device_authorization_grants_device_client_id_device_clients_id_fk" FOREIGN KEY ("device_client_id") REFERENCES "public"."device_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_clients" ADD CONSTRAINT "device_clients_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_clients" ADD CONSTRAINT "device_clients_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_clients" ADD CONSTRAINT "device_clients_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_refresh_tokens" ADD CONSTRAINT "device_refresh_tokens_device_client_id_device_clients_id_fk" FOREIGN KEY ("device_client_id") REFERENCES "public"."device_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_refresh_tokens" ADD CONSTRAINT "device_refresh_tokens_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_authorization_grants_device_code_idx" ON "device_authorization_grants" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "device_authorization_grants_user_code_idx" ON "device_authorization_grants" USING btree ("user_code_digest");--> statement-breakpoint
CREATE INDEX "device_authorization_grants_status_expiry_idx" ON "device_authorization_grants" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "device_clients_owner_status_heartbeat_idx" ON "device_clients" USING btree ("owner_user_id","status","last_heartbeat_at","id");--> statement-breakpoint
CREATE INDEX "device_clients_oauth_client_idx" ON "device_clients" USING btree ("oauth_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_refresh_tokens_family_generation_idx" ON "device_refresh_tokens" USING btree ("family_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "device_refresh_tokens_hash_idx" ON "device_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_refresh_tokens_device_expiry_idx" ON "device_refresh_tokens" USING btree ("device_client_id","revoked_at","expires_at");--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_device_client_id_device_clients_id_fk" FOREIGN KEY ("device_client_id") REFERENCES "public"."device_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_tokens_device_client_idx" ON "oauth_access_tokens" USING btree ("device_client_id");--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_kind_secret_check" CHECK (("oauth_clients"."client_kind" = 'public_device' AND "oauth_clients"."secret_hash" IS NULL AND "oauth_clients"."secret_prefix" IS NULL)
        OR ("oauth_clients"."client_kind" = 'confidential' AND "oauth_clients"."secret_hash" IS NOT NULL AND "oauth_clients"."secret_prefix" IS NOT NULL));