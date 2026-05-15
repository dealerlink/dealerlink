CREATE TYPE "public"."quotation_discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."quotation_sent_via" AS ENUM('email', 'pdf_download', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded');--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"product_sku" text NOT NULL,
	"product_name" text NOT NULL,
	"hsn_code" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_of_measure" text DEFAULT 'Nos' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"gst_rate" numeric(5, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_lines_qty_chk" CHECK ("quotation_lines"."quantity" > 0),
	CONSTRAINT "quotation_lines_unit_price_chk" CHECK ("quotation_lines"."unit_price" >= 0),
	CONSTRAINT "quotation_lines_gst_rate_chk" CHECK ("quotation_lines"."gst_rate" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "quotation_lines_total_chk" CHECK ("quotation_lines"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"from_status" "quotation_status",
	"to_status" "quotation_status" NOT NULL,
	"transitioned_by" uuid,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_number" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"parent_quotation_id" uuid,
	"deal_id" uuid,
	"dealer_id" uuid NOT NULL,
	"prepared_by" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"quote_date" date DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"discount_type" "quotation_discount_type",
	"discount_value" numeric(12, 2),
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"terms_and_conditions" text,
	"notes" text,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_via" "quotation_sent_via",
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "quotations_revision_chk" CHECK ("quotations"."revision" >= 1),
	CONSTRAINT "quotations_state_codes_chk" CHECK (length("quotations"."tenant_state_at_issue") = 2 AND length("quotations"."place_of_supply") = 2),
	CONSTRAINT "quotations_discount_value_chk" CHECK (("quotations"."discount_type" IS NULL AND "quotations"."discount_value" IS NULL) OR ("quotations"."discount_type" IS NOT NULL AND "quotations"."discount_value" IS NOT NULL AND "quotations"."discount_value" > 0)),
	CONSTRAINT "quotations_discount_percent_chk" CHECK ("quotations"."discount_type" <> 'percent' OR "quotations"."discount_value" <= 100),
	CONSTRAINT "quotations_subtotal_chk" CHECK ("quotations"."subtotal" >= 0),
	CONSTRAINT "quotations_total_chk" CHECK ("quotations"."total_amount" >= 0),
	CONSTRAINT "quotations_validity_chk" CHECK ("quotations"."valid_until" >= "quotations"."quote_date")
);
--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_transitioned_by_users_id_fk" FOREIGN KEY ("transitioned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_lines_quote_pos_uq" ON "quotation_lines" USING btree ("quotation_id","line_number");--> statement-breakpoint
CREATE INDEX "quotation_lines_tenant_product_ix" ON "quotation_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "quotation_status_history_quote_ix" ON "quotation_status_history" USING btree ("tenant_id","quotation_id","transitioned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_tenant_number_rev_uq" ON "quotations" USING btree ("tenant_id","quote_number","revision");--> statement-breakpoint
CREATE INDEX "quotations_tenant_status_date_ix" ON "quotations" USING btree ("tenant_id","status","quote_date");--> statement-breakpoint
CREATE INDEX "quotations_tenant_dealer_date_ix" ON "quotations" USING btree ("tenant_id","dealer_id","quote_date");--> statement-breakpoint
CREATE INDEX "quotations_tenant_deal_ix" ON "quotations" USING btree ("tenant_id","deal_id");--> statement-breakpoint
CREATE INDEX "quotations_tenant_prepared_ix" ON "quotations" USING btree ("tenant_id","prepared_by");--> statement-breakpoint
CREATE INDEX "quotations_tenant_parent_ix" ON "quotations" USING btree ("tenant_id","parent_quotation_id");