ALTER TABLE "generated_documents" ALTER COLUMN "storage_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD COLUMN "storage_ref_purged_at" timestamp with time zone;