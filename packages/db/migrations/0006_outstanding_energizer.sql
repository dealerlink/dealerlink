CREATE TYPE "public"."deal_lost_reason" AS ENUM('price', 'competitor', 'timing', 'no_budget', 'other');--> statement-breakpoint
CREATE TYPE "public"."deal_source" AS ENUM('inbound', 'outbound', 'referral', 'repeat_business', 'other');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('qualification', 'needs_analysis', 'quotation_sent', 'negotiation', 'verbal_commit', 'po_pending', 'payment_pending', 'ready_for_dispatch', 'closed');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "deal_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"estimated_quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_products_qty_chk" CHECK ("deal_products"."estimated_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage" "deal_stage",
	"to_stage" "deal_stage" NOT NULL,
	"from_status" "deal_status",
	"to_status" "deal_status" NOT NULL,
	"transitioned_by" uuid,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"overridden" boolean DEFAULT false NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deal_code" text NOT NULL,
	"title" text NOT NULL,
	"dealer_id" uuid NOT NULL,
	"assigned_to" uuid NOT NULL,
	"stage" "deal_stage" DEFAULT 'qualification' NOT NULL,
	"status" "deal_status" DEFAULT 'open' NOT NULL,
	"estimated_value" numeric(12, 2),
	"probability_percent" integer,
	"expected_close_date" date,
	"source" "deal_source" DEFAULT 'outbound' NOT NULL,
	"lost_reason" "deal_lost_reason",
	"lost_reason_note" text,
	"notes" text,
	"hot" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "deals_probability_chk" CHECK ("deals"."probability_percent" IS NULL OR ("deals"."probability_percent" >= 0 AND "deals"."probability_percent" <= 100)),
	CONSTRAINT "deals_estimated_value_chk" CHECK ("deals"."estimated_value" IS NULL OR "deals"."estimated_value" >= 0),
	CONSTRAINT "deals_closed_status_chk" CHECK (("deals"."stage" <> 'closed') OR ("deals"."status" IN ('won', 'lost'))),
	CONSTRAINT "deals_open_status_chk" CHECK (("deals"."stage" = 'closed') OR ("deals"."status" = 'open')),
	CONSTRAINT "deals_lost_reason_chk" CHECK (("deals"."status" <> 'lost') OR ("deals"."lost_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_transitioned_by_users_id_fk" FOREIGN KEY ("transitioned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_products_tenant_deal_ix" ON "deal_products" USING btree ("tenant_id","deal_id");--> statement-breakpoint
CREATE INDEX "deal_products_tenant_product_ix" ON "deal_products" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_tenant_deal_ix" ON "deal_stage_history" USING btree ("tenant_id","deal_id","transitioned_at");--> statement-breakpoint
CREATE INDEX "deal_stage_history_tenant_at_ix" ON "deal_stage_history" USING btree ("tenant_id","transitioned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_tenant_code_uq" ON "deals" USING btree ("tenant_id","deal_code");--> statement-breakpoint
CREATE INDEX "deals_tenant_stage_status_ix" ON "deals" USING btree ("tenant_id","stage","status");--> statement-breakpoint
CREATE INDEX "deals_tenant_assigned_stage_ix" ON "deals" USING btree ("tenant_id","assigned_to","stage");--> statement-breakpoint
CREATE INDEX "deals_tenant_hot_ix" ON "deals" USING btree ("tenant_id") WHERE "deals"."hot" = true;--> statement-breakpoint
CREATE INDEX "deals_tenant_activity_ix" ON "deals" USING btree ("tenant_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "deals_tenant_dealer_ix" ON "deals" USING btree ("tenant_id","dealer_id");