CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid,
	"performa_invoice_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allocated_by" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "payment_allocations_amount_chk" CHECK ("payment_allocations"."amount" > 0),
	CONSTRAINT "payment_allocations_target_chk" CHECK (("payment_allocations"."order_id" IS NOT NULL)::int + ("payment_allocations"."performa_invoice_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_number" text NOT NULL,
	"dealer_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"received_date" date NOT NULL,
	"deposited_to_bank" text,
	"deposited_date" date,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"cleared_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"bounced_reason" text,
	"refunded_at" timestamp with time zone,
	"refunded_reason" text,
	"allocated_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_allocated_chk" CHECK ("payments"."allocated_amount" >= 0 AND "payments"."allocated_amount" <= "payments"."amount"),
	CONSTRAINT "payments_method_chk" CHECK ("payments"."method" IN ('bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other')),
	CONSTRAINT "payments_status_chk" CHECK ("payments"."status" IN ('pending_verification', 'verified', 'cleared', 'bounced', 'refunded'))
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_performa_invoice_id_performa_invoices_id_fk" FOREIGN KEY ("performa_invoice_id") REFERENCES "public"."performa_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_payment_ix" ON "payment_allocations" USING btree ("tenant_id","payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_order_ix" ON "payment_allocations" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_pi_ix" ON "payment_allocations" USING btree ("tenant_id","performa_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tenant_number_uq" ON "payments" USING btree ("tenant_id","payment_number");--> statement-breakpoint
CREATE INDEX "payments_tenant_dealer_date_ix" ON "payments" USING btree ("tenant_id","dealer_id","received_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_tenant_status_date_ix" ON "payments" USING btree ("tenant_id","status","received_date" DESC NULLS LAST);