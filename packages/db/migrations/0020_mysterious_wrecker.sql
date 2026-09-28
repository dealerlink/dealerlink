CREATE TABLE "dealer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dealer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"contact_person" text,
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "dealer_addresses_state_chk" CHECK ("dealer_addresses"."state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "dealer_addresses_label_not_empty_chk" CHECK (btrim("dealer_addresses"."label") <> ''),
	CONSTRAINT "dealer_addresses_line1_not_empty_chk" CHECK (btrim("dealer_addresses"."address_line1") <> '')
);
--> statement-breakpoint
ALTER TABLE "dealer_addresses" ADD CONSTRAINT "dealer_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_addresses" ADD CONSTRAINT "dealer_addresses_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_addresses" ADD CONSTRAINT "dealer_addresses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_addresses" ADD CONSTRAINT "dealer_addresses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_addresses_tenant_dealer_ix" ON "dealer_addresses" USING btree ("tenant_id","dealer_id");--> statement-breakpoint
CREATE INDEX "dealer_addresses_tenant_state_ix" ON "dealer_addresses" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_addresses_one_default_uq" ON "dealer_addresses" USING btree ("tenant_id","dealer_id") WHERE "dealer_addresses"."is_default" AND "dealer_addresses"."deleted_at" IS NULL;