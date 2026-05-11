CREATE TABLE "email_delivery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"template" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"meta" jsonb,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbound_token_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD CONSTRAINT "email_delivery_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_token_history" ADD CONSTRAINT "inbound_token_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_delivery_tenant_ix" ON "email_delivery_log" USING btree ("tenant_id","queued_at");--> statement-breakpoint
CREATE INDEX "email_delivery_recipient_ix" ON "email_delivery_log" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "email_delivery_status_ix" ON "email_delivery_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbound_token_history_tenant_ix" ON "inbound_token_history" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "inbound_token_history_token_ix" ON "inbound_token_history" USING btree ("token","expires_at");