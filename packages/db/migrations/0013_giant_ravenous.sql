ALTER TYPE "public"."performa_invoice_status" ADD VALUE 'expired';--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text
);
--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "bounced_type" text;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "bounced_reason" text;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "complained_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD COLUMN "last_event_type" text;--> statement-breakpoint
CREATE INDEX "webhook_events_provider_received_ix" ON "webhook_events" USING btree ("provider","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uq" ON "webhook_events" USING btree ("provider",("payload" ->> 'id'));--> statement-breakpoint
CREATE INDEX "email_delivery_provider_msg_ix" ON "email_delivery_log" USING btree ("tenant_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_delivery_status_event_ix" ON "email_delivery_log" USING btree ("tenant_id","status","last_event_at" DESC NULLS LAST);