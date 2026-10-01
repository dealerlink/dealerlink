CREATE TYPE "public"."invoice_discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."generated_document_type" ADD VALUE 'credit_note';--> statement-breakpoint
ALTER TYPE "public"."generated_document_type" ADD VALUE 'debit_note';--> statement-breakpoint
CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
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
	"credit_note_id" uuid NOT NULL,
	CONSTRAINT "credit_note_lines_qty_chk" CHECK ("credit_note_lines"."quantity" > 0),
	CONSTRAINT "credit_note_lines_unit_price_chk" CHECK ("credit_note_lines"."unit_price" >= 0),
	CONSTRAINT "credit_note_lines_gst_rate_chk" CHECK ("credit_note_lines"."gst_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"delivery_arrangement" text,
	"prepared_by" uuid,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_reason" text,
	"terms_and_conditions" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"credit_note_number" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"credit_note_date" date DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "credit_notes_tenant_state_chk" CHECK ("credit_notes"."tenant_state_at_issue" ~ '^[A-Z]{2}$'),
	CONSTRAINT "credit_notes_place_of_supply_chk" CHECK ("credit_notes"."place_of_supply" ~ '^[A-Z]{2}$'),
	CONSTRAINT "credit_notes_delivery_arrangement_chk" CHECK ("credit_notes"."delivery_arrangement" IS NULL OR "credit_notes"."delivery_arrangement" IN ('s10_1_a', 's10_1_b')),
	CONSTRAINT "credit_notes_cancelled_accountable_chk" CHECK ("credit_notes"."status" <> 'cancelled' OR ("credit_notes"."cancelled_reason" IS NOT NULL AND "credit_notes"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "debit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
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
	"debit_note_id" uuid NOT NULL,
	CONSTRAINT "debit_note_lines_qty_chk" CHECK ("debit_note_lines"."quantity" > 0),
	CONSTRAINT "debit_note_lines_unit_price_chk" CHECK ("debit_note_lines"."unit_price" >= 0),
	CONSTRAINT "debit_note_lines_gst_rate_chk" CHECK ("debit_note_lines"."gst_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"delivery_arrangement" text,
	"prepared_by" uuid,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_reason" text,
	"terms_and_conditions" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"debit_note_number" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"debit_note_date" date DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "debit_notes_tenant_state_chk" CHECK ("debit_notes"."tenant_state_at_issue" ~ '^[A-Z]{2}$'),
	CONSTRAINT "debit_notes_place_of_supply_chk" CHECK ("debit_notes"."place_of_supply" ~ '^[A-Z]{2}$'),
	CONSTRAINT "debit_notes_delivery_arrangement_chk" CHECK ("debit_notes"."delivery_arrangement" IS NULL OR "debit_notes"."delivery_arrangement" IN ('s10_1_a', 's10_1_b')),
	CONSTRAINT "debit_notes_cancelled_accountable_chk" CHECK ("debit_notes"."status" <> 'cancelled' OR ("debit_notes"."cancelled_reason" IS NOT NULL AND "debit_notes"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
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
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "invoice_lines_qty_chk" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_unit_price_chk" CHECK ("invoice_lines"."unit_price" >= 0),
	CONSTRAINT "invoice_lines_gst_rate_chk" CHECK ("invoice_lines"."gst_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"delivery_arrangement" text,
	"prepared_by" uuid,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_reason" text,
	"terms_and_conditions" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"invoice_number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"invoice_date" date DEFAULT now() NOT NULL,
	"discount_type" "invoice_discount_type",
	"discount_value" numeric(12, 2),
	"round_off" numeric(12, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "invoices_tenant_state_chk" CHECK ("invoices"."tenant_state_at_issue" ~ '^[A-Z]{2}$'),
	CONSTRAINT "invoices_place_of_supply_chk" CHECK ("invoices"."place_of_supply" ~ '^[A-Z]{2}$'),
	CONSTRAINT "invoices_delivery_arrangement_chk" CHECK ("invoices"."delivery_arrangement" IS NULL OR "invoices"."delivery_arrangement" IN ('s10_1_a', 's10_1_b')),
	CONSTRAINT "invoices_cancelled_accountable_chk" CHECK ("invoices"."status" <> 'cancelled' OR ("invoices"."cancelled_reason" IS NOT NULL AND "invoices"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "invoices_round_off_chk" CHECK (abs("invoices"."round_off") < 1.00)
);
--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_debit_note_id_debit_notes_id_fk" FOREIGN KEY ("debit_note_id") REFERENCES "public"."debit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_note_lines_note_pos_uq" ON "credit_note_lines" USING btree ("credit_note_id","line_number");--> statement-breakpoint
CREATE INDEX "credit_note_lines_tenant_product_ix" ON "credit_note_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_tenant_number_uq" ON "credit_notes" USING btree ("tenant_id","credit_note_number");--> statement-breakpoint
CREATE INDEX "credit_notes_tenant_invoice_ix" ON "credit_notes" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "credit_notes_tenant_status_date_ix" ON "credit_notes" USING btree ("tenant_id","status","credit_note_date");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_note_lines_note_pos_uq" ON "debit_note_lines" USING btree ("debit_note_id","line_number");--> statement-breakpoint
CREATE INDEX "debit_note_lines_tenant_product_ix" ON "debit_note_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_notes_tenant_number_uq" ON "debit_notes" USING btree ("tenant_id","debit_note_number");--> statement-breakpoint
CREATE INDEX "debit_notes_tenant_invoice_ix" ON "debit_notes" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "debit_notes_tenant_status_date_ix" ON "debit_notes" USING btree ("tenant_id","status","debit_note_date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_invoice_pos_uq" ON "invoice_lines" USING btree ("invoice_id","line_number");--> statement-breakpoint
CREATE INDEX "invoice_lines_tenant_product_ix" ON "invoice_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_number_uq" ON "invoices" USING btree ("tenant_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_date_ix" ON "invoices" USING btree ("tenant_id","status","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_tenant_billto_ix" ON "invoices" USING btree ("tenant_id","bill_to_dealer_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_order_ix" ON "invoices" USING btree ("tenant_id","order_id");