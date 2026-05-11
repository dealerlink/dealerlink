CREATE TABLE "procurement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"procurement_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"serials_received" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_items_qty_chk" CHECK ("procurement_items"."quantity" > 0),
	CONSTRAINT "procurement_items_unit_chk" CHECK ("procurement_items"."unit_price" >= 0),
	CONSTRAINT "procurement_items_line_chk" CHECK ("procurement_items"."line_total" >= 0),
	CONSTRAINT "procurement_items_serials_chk" CHECK ("procurement_items"."serials_received" >= 0 AND "procurement_items"."serials_received" <= "procurement_items"."quantity")
);
--> statement-breakpoint
ALTER TABLE "procurements" DROP CONSTRAINT "procurements_total_chk";--> statement-breakpoint
ALTER TABLE "procurements" ALTER COLUMN "total_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "procurements" ALTER COLUMN "total_amount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "procurements" ALTER COLUMN "total_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "procurements" ADD COLUMN "procurement_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "procurements" ADD COLUMN "invoice_attachment_url" text;--> statement-breakpoint
ALTER TABLE "procurements" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "procurements" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_procurement_id_procurements_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."procurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procurement_items_tenant_proc_ix" ON "procurement_items" USING btree ("tenant_id","procurement_id");--> statement-breakpoint
CREATE INDEX "procurement_items_tenant_product_ix" ON "procurement_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "procurements_tenant_number_uq" ON "procurements" USING btree ("tenant_id","procurement_number");--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_gstin_not_empty_chk" CHECK ("dealers"."gstin" IS NULL OR "dealers"."gstin" <> '');--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_total_chk" CHECK ("procurements"."total_amount" >= 0);