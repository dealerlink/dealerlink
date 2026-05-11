CREATE TYPE "public"."dealer_category" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."dealer_risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."dealer_status" AS ENUM('active', 'inactive', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."dealer_type" AS ENUM('retailer', 'wholesaler', 'installer', 'epc', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'inactive', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."inventory_item_status" AS ENUM('in_stock', 'reserved', 'dispatched', 'delivered', 'returned', 'damaged', 'lost');--> statement-breakpoint
CREATE TYPE "public"."procurement_status" AS ENUM('draft', 'confirmed', 'received');--> statement-breakpoint
CREATE TABLE "dealers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dealer_code" text NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"alt_phone" text,
	"email" text,
	"alt_email" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"pincode" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"gstin" text,
	"pan" text,
	"type" "dealer_type" DEFAULT 'retailer' NOT NULL,
	"category" "dealer_category" DEFAULT 'B' NOT NULL,
	"risk_level" "dealer_risk_level" DEFAULT 'low' NOT NULL,
	"credit_limit" numeric(14, 2),
	"credit_period_days" integer,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" "dealer_status" DEFAULT 'active' NOT NULL,
	"inactivated_at" timestamp with time zone,
	"inactivated_reason" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "dealers_credit_limit_chk" CHECK ("dealers"."credit_limit" IS NULL OR "dealers"."credit_limit" >= 0),
	CONSTRAINT "dealers_credit_period_chk" CHECK ("dealers"."credit_period_days" IS NULL OR "dealers"."credit_period_days" >= 0),
	CONSTRAINT "dealers_discount_chk" CHECK ("dealers"."discount_percent" >= 0 AND "dealers"."discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"manufacturer" text,
	"model" text,
	"hsn_code" text NOT NULL,
	"gst_rate" numeric(5, 2) NOT NULL,
	"category" text,
	"subcategory" text,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mrp" numeric(14, 2),
	"default_purchase_price" numeric(14, 2),
	"default_selling_price" numeric(14, 2),
	"requires_serial" boolean DEFAULT true NOT NULL,
	"unit_of_measure" text DEFAULT 'Nos' NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_hsn_chk" CHECK ("products"."hsn_code" ~ '^[0-9]{4,8}$'),
	CONSTRAINT "products_gst_rate_chk" CHECK ("products"."gst_rate" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "products_mrp_chk" CHECK ("products"."mrp" IS NULL OR "products"."mrp" >= 0),
	CONSTRAINT "products_purchase_chk" CHECK ("products"."default_purchase_price" IS NULL OR "products"."default_purchase_price" >= 0),
	CONSTRAINT "products_selling_chk" CHECK ("products"."default_selling_price" IS NULL OR "products"."default_selling_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"serial_number" text,
	"status" "inventory_item_status" DEFAULT 'in_stock' NOT NULL,
	"warehouse_code" text,
	"bin" text,
	"procurement_id" uuid,
	"procurement_date" date,
	"purchase_price" numeric(14, 2),
	"reserved_for_order_id" uuid,
	"reserved_for_dealer_id" uuid,
	"reserved_at" timestamp with time zone,
	"dispatch_id" uuid,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivered_to" text,
	"warranty_start_date" date,
	"warranty_end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "inventory_items_purchase_chk" CHECK ("inventory_items"."purchase_price" IS NULL OR "inventory_items"."purchase_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "procurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"procurement_date" date NOT NULL,
	"supplier_name" text NOT NULL,
	"invoice_number" text,
	"invoice_date" date,
	"total_amount" numeric(14, 2),
	"notes" text,
	"status" "procurement_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "procurements_total_chk" CHECK ("procurements"."total_amount" IS NULL OR "procurements"."total_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_procurement_id_procurements_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."procurements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_tenant_code_uq" ON "dealers" USING btree ("tenant_id","dealer_code");--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_tenant_gstin_uq" ON "dealers" USING btree ("tenant_id","gstin") WHERE "dealers"."gstin" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "dealers_tenant_status_ix" ON "dealers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "dealers_tenant_type_ix" ON "dealers" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "dealers_tenant_category_ix" ON "dealers" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "dealers_tenant_risk_ix" ON "dealers" USING btree ("tenant_id","risk_level");--> statement-breakpoint
CREATE INDEX "dealers_tenant_state_ix" ON "dealers" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_uq" ON "products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "products_tenant_status_ix" ON "products" USING btree ("tenant_id","status","category");--> statement-breakpoint
CREATE INDEX "products_tenant_manufacturer_ix" ON "products" USING btree ("tenant_id","manufacturer");--> statement-breakpoint
CREATE INDEX "products_tenant_category_ix" ON "products" USING btree ("tenant_id","category","subcategory");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_tenant_serial_uq" ON "inventory_items" USING btree ("tenant_id","serial_number") WHERE "inventory_items"."serial_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inventory_items_tenant_status_product_ix" ON "inventory_items" USING btree ("tenant_id","status","product_id");--> statement-breakpoint
CREATE INDEX "inventory_items_tenant_product_status_ix" ON "inventory_items" USING btree ("tenant_id","product_id","status");--> statement-breakpoint
CREATE INDEX "inventory_items_tenant_dealer_ix" ON "inventory_items" USING btree ("tenant_id","reserved_for_dealer_id");--> statement-breakpoint
CREATE INDEX "procurements_tenant_status_ix" ON "procurements" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "procurements_tenant_date_ix" ON "procurements" USING btree ("tenant_id","procurement_date");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dealers_legal_name_trgm_ix" ON "dealers" USING gin (lower("legal_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dealers_gstin_trgm_ix" ON "dealers" USING gin ("gstin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dealers_dealer_code_trgm_ix" ON "dealers" USING gin ("dealer_code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dealers_tenant_tags_ix" ON "dealers" USING gin ("tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_name_trgm_ix" ON "products" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_manufacturer_trgm_ix" ON "products" USING gin (lower("manufacturer") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_model_trgm_ix" ON "products" USING gin (lower("model") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_serial_trgm_ix" ON "inventory_items" USING gin ("serial_number" gin_trgm_ops);
