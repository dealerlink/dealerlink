ALTER TABLE "performa_invoices" ADD COLUMN "delivery_arrangement" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_arrangement" text;--> statement-breakpoint
ALTER TABLE "performa_invoices" ADD CONSTRAINT "performa_invoices_delivery_arrangement_chk" CHECK ("performa_invoices"."delivery_arrangement" IN ('s10_1_a', 's10_1_b'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_arrangement_chk" CHECK ("orders"."delivery_arrangement" IN ('s10_1_a', 's10_1_b'));