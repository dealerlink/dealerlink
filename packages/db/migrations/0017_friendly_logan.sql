ALTER TABLE "products" DROP CONSTRAINT "products_gst_rate_chk";--> statement-breakpoint
ALTER TABLE "quotation_lines" DROP CONSTRAINT "quotation_lines_gst_rate_chk";--> statement-breakpoint
ALTER TABLE "performa_invoice_lines" DROP CONSTRAINT "performa_invoice_lines_gst_rate_chk";--> statement-breakpoint
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_gst_rate_chk";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_gst_rate_chk" CHECK ("products"."gst_rate" IN (0, 3, 5, 12, 18, 28));--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_gst_rate_chk" CHECK ("quotation_lines"."gst_rate" IN (0, 3, 5, 12, 18, 28));--> statement-breakpoint
ALTER TABLE "performa_invoice_lines" ADD CONSTRAINT "performa_invoice_lines_gst_rate_chk" CHECK ("performa_invoice_lines"."gst_rate" IN (0, 3, 5, 12, 18, 28));--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_gst_rate_chk" CHECK ("order_lines"."gst_rate" IN (0, 3, 5, 12, 18, 28));