CREATE TYPE "public"."performa_invoice_discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."performa_invoice_status" AS ENUM('draft', 'sent', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'partially_dispatched', 'fully_dispatched', 'delivered', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "performa_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"performa_invoice_id" uuid NOT NULL,
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
	CONSTRAINT "performa_invoice_lines_qty_chk" CHECK ("performa_invoice_lines"."quantity" > 0),
	CONSTRAINT "performa_invoice_lines_unit_price_chk" CHECK ("performa_invoice_lines"."unit_price" >= 0),
	CONSTRAINT "performa_invoice_lines_gst_rate_chk" CHECK ("performa_invoice_lines"."gst_rate" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "performa_invoice_lines_total_chk" CHECK ("performa_invoice_lines"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "performa_invoice_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"performa_invoice_id" uuid NOT NULL,
	"from_status" "performa_invoice_status",
	"to_status" "performa_invoice_status" NOT NULL,
	"transitioned_by" uuid,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "performa_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pi_number" text NOT NULL,
	"quotation_id" uuid NOT NULL,
	"deal_id" uuid,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"prepared_by" uuid NOT NULL,
	"pi_date" date DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"discount_type" "performa_invoice_discount_type",
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
	"status" "performa_invoice_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "performa_invoices_state_codes_chk" CHECK (length("performa_invoices"."tenant_state_at_issue") >= 2 AND length("performa_invoices"."place_of_supply") >= 2),
	CONSTRAINT "performa_invoices_discount_value_chk" CHECK (("performa_invoices"."discount_type" IS NULL AND "performa_invoices"."discount_value" IS NULL) OR ("performa_invoices"."discount_type" IS NOT NULL AND "performa_invoices"."discount_value" IS NOT NULL AND "performa_invoices"."discount_value" > 0)),
	CONSTRAINT "performa_invoices_discount_percent_chk" CHECK ("performa_invoices"."discount_type" <> 'percent' OR "performa_invoices"."discount_value" <= 100),
	CONSTRAINT "performa_invoices_subtotal_chk" CHECK ("performa_invoices"."subtotal" >= 0),
	CONSTRAINT "performa_invoices_total_chk" CHECK ("performa_invoices"."total_amount" >= 0),
	CONSTRAINT "performa_invoices_validity_chk" CHECK ("performa_invoices"."valid_until" >= "performa_invoices"."pi_date")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
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
	"reserved_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"dispatched_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_qty_chk" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_unit_price_chk" CHECK ("order_lines"."unit_price" >= 0),
	CONSTRAINT "order_lines_gst_rate_chk" CHECK ("order_lines"."gst_rate" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "order_lines_total_chk" CHECK ("order_lines"."line_total" >= 0),
	CONSTRAINT "order_lines_reserved_chk" CHECK ("order_lines"."reserved_quantity" >= 0 AND "order_lines"."reserved_quantity" <= "order_lines"."quantity"),
	CONSTRAINT "order_lines_dispatched_chk" CHECK ("order_lines"."dispatched_quantity" >= 0 AND "order_lines"."dispatched_quantity" <= "order_lines"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"transitioned_by" uuid,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"performa_invoice_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"deal_id" uuid,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"tenant_state_at_issue" text NOT NULL,
	"place_of_supply" text NOT NULL,
	"order_date" date DEFAULT now() NOT NULL,
	"expected_dispatch_date" date,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"payment_status" "order_payment_status" DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "orders_state_codes_chk" CHECK (length("orders"."tenant_state_at_issue") >= 2 AND length("orders"."place_of_supply") >= 2),
	CONSTRAINT "orders_subtotal_chk" CHECK ("orders"."subtotal" >= 0),
	CONSTRAINT "orders_total_chk" CHECK ("orders"."total_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "performa_invoice_lines" ADD CONSTRAINT "performa_invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoice_lines" ADD CONSTRAINT "performa_invoice_lines_performa_invoice_id_performa_invoices_id_fk" FOREIGN KEY ("performa_invoice_id") REFERENCES "public"."performa_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoice_lines" ADD CONSTRAINT "performa_invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoice_status_history" ADD CONSTRAINT "performa_invoice_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoice_status_history" ADD CONSTRAINT "performa_invoice_status_history_performa_invoice_id_performa_invoices_id_fk" FOREIGN KEY ("performa_invoice_id") REFERENCES "public"."performa_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoice_status_history" ADD CONSTRAINT "performa_invoice_status_history_transitioned_by_users_id_fk" FOREIGN KEY ("transitioned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_transitioned_by_users_id_fk" FOREIGN KEY ("transitioned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_performa_invoice_id_performa_invoices_id_fk" FOREIGN KEY ("performa_invoice_id") REFERENCES "public"."performa_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performa_invoice_lines_pi_pos_uq" ON "performa_invoice_lines" USING btree ("performa_invoice_id","line_number");--> statement-breakpoint
CREATE INDEX "performa_invoice_lines_tenant_product_ix" ON "performa_invoice_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "performa_invoice_status_history_pi_ix" ON "performa_invoice_status_history" USING btree ("tenant_id","performa_invoice_id","transitioned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "performa_invoices_tenant_number_uq" ON "performa_invoices" USING btree ("tenant_id","pi_number");--> statement-breakpoint
CREATE INDEX "performa_invoices_tenant_status_date_ix" ON "performa_invoices" USING btree ("tenant_id","status","pi_date");--> statement-breakpoint
CREATE INDEX "performa_invoices_tenant_billto_ix" ON "performa_invoices" USING btree ("tenant_id","bill_to_dealer_id");--> statement-breakpoint
CREATE INDEX "performa_invoices_tenant_quotation_ix" ON "performa_invoices" USING btree ("tenant_id","quotation_id");--> statement-breakpoint
CREATE INDEX "performa_invoices_tenant_deal_ix" ON "performa_invoices" USING btree ("tenant_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_pos_uq" ON "order_lines" USING btree ("order_id","line_number");--> statement-breakpoint
CREATE INDEX "order_lines_tenant_product_ix" ON "order_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_ix" ON "order_status_history" USING btree ("tenant_id","order_id","transitioned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_number_uq" ON "orders" USING btree ("tenant_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_date_ix" ON "orders" USING btree ("tenant_id","status","order_date");--> statement-breakpoint
CREATE INDEX "orders_tenant_payment_ix" ON "orders" USING btree ("tenant_id","payment_status");--> statement-breakpoint
CREATE INDEX "orders_tenant_billto_ix" ON "orders" USING btree ("tenant_id","bill_to_dealer_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_pi_ix" ON "orders" USING btree ("tenant_id","performa_invoice_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_deal_ix" ON "orders" USING btree ("tenant_id","deal_id");