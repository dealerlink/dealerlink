CREATE TYPE "public"."generated_document_storage" AS ENUM('spaces', 'inline');--> statement-breakpoint
CREATE TYPE "public"."generated_document_type" AS ENUM('quotation', 'invoice', 'dispatch', 'payment_receipt');--> statement-breakpoint
CREATE TABLE "generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_type" "generated_document_type" NOT NULL,
	"document_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage" "generated_document_storage" NOT NULL,
	"storage_ref" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" uuid,
	"expires_at" timestamp with time zone,
	CONSTRAINT "generated_documents_size_chk" CHECK ("generated_documents"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_state_codes_chk";--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_documents_tenant_doc_ix" ON "generated_documents" USING btree ("tenant_id","document_type","document_id");--> statement-breakpoint
CREATE INDEX "generated_documents_tenant_generated_ix" ON "generated_documents" USING btree ("tenant_id","generated_at");--> statement-breakpoint
CREATE INDEX "generated_documents_storage_generated_ix" ON "generated_documents" USING btree ("storage","generated_at");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_state_codes_chk" CHECK (length("quotations"."tenant_state_at_issue") >= 2 AND length("quotations"."place_of_supply") >= 2);