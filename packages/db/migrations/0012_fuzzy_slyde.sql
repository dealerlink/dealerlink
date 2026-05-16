CREATE TABLE "dispatch_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"order_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_sku" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_lines_qty_chk" CHECK ("dispatch_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "dispatch_serials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"dispatch_line_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dispatch_number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"bill_to_dealer_id" uuid NOT NULL,
	"ship_to_dealer_id" uuid NOT NULL,
	"dispatch_date" date DEFAULT now() NOT NULL,
	"expected_delivery_date" date,
	"vehicle_number" text,
	"transporter_name" text,
	"transporter_docket_number" text,
	"driver_name" text,
	"driver_phone" text,
	"eway_bill_number" text,
	"eway_bill_date" date,
	"status" text DEFAULT 'in_transit' NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_acknowledged_by" text,
	"returned_at" timestamp with time zone,
	"returned_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "dispatches_status_chk" CHECK ("dispatches"."status" IN ('in_transit', 'delivered', 'returned'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "partially_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fully_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_serials" ADD CONSTRAINT "dispatch_serials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_serials" ADD CONSTRAINT "dispatch_serials_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_serials" ADD CONSTRAINT "dispatch_serials_dispatch_line_id_dispatch_lines_id_fk" FOREIGN KEY ("dispatch_line_id") REFERENCES "public"."dispatch_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_serials" ADD CONSTRAINT "dispatch_serials_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_bill_to_dealer_id_dealers_id_fk" FOREIGN KEY ("bill_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_ship_to_dealer_id_dealers_id_fk" FOREIGN KEY ("ship_to_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_lines_dispatch_pos_uq" ON "dispatch_lines" USING btree ("dispatch_id","line_number");--> statement-breakpoint
CREATE INDEX "dispatch_lines_tenant_dispatch_ix" ON "dispatch_lines" USING btree ("tenant_id","dispatch_id");--> statement-breakpoint
CREATE INDEX "dispatch_lines_tenant_orderline_ix" ON "dispatch_lines" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_serials_tenant_item_uq" ON "dispatch_serials" USING btree ("tenant_id","inventory_item_id");--> statement-breakpoint
CREATE INDEX "dispatch_serials_tenant_dispatch_ix" ON "dispatch_serials" USING btree ("tenant_id","dispatch_id");--> statement-breakpoint
CREATE INDEX "dispatch_serials_tenant_line_ix" ON "dispatch_serials" USING btree ("tenant_id","dispatch_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatches_tenant_number_uq" ON "dispatches" USING btree ("tenant_id","dispatch_number");--> statement-breakpoint
CREATE INDEX "dispatches_tenant_status_date_ix" ON "dispatches" USING btree ("tenant_id","status","dispatch_date");--> statement-breakpoint
CREATE INDEX "dispatches_tenant_order_ix" ON "dispatches" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "dispatches_tenant_shipto_ix" ON "dispatches" USING btree ("tenant_id","ship_to_dealer_id");