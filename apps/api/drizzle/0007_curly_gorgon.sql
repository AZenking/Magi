ALTER TABLE "device_refresh_tokens" ADD CONSTRAINT "device_refresh_tokens_replaced_by_id_device_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."device_refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_authorization_grants_device_client_idx" ON "device_authorization_grants" USING btree ("device_client_id");--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_tokens_grant_device_consistency_check" CHECK ((
        ("oauth_access_tokens"."grant_type" = 'client_credentials' AND "oauth_access_tokens"."device_client_id" IS NULL)
        OR ("oauth_access_tokens"."grant_type" IN ('device_code', 'refresh_token') AND "oauth_access_tokens"."device_client_id" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "device_authorization_grants" ADD CONSTRAINT "device_authorization_grants_status_check" CHECK ("device_authorization_grants"."status" IN ('pending', 'approved', 'denied', 'consumed', 'expired'));--> statement-breakpoint
ALTER TABLE "device_refresh_tokens" ADD CONSTRAINT "device_refresh_tokens_generation_check" CHECK ("device_refresh_tokens"."generation" > 0);