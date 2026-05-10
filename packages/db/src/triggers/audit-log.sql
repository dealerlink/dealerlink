-- ============================================================================
-- AUDIT-LOG TRIGGER
-- ----------------------------------------------------------------------------
-- A single generic trigger function applied to every table that needs
-- audit history (per CLAUDE.md §6: orders, payments, dispatches, inventory).
-- Day 2 also applies it to tenants and users so the pipeline is exercised
-- end-to-end before downstream entities exist.
--
-- The trigger pulls tenant_id from the changed row when present, otherwise
-- falls back to app.tenant_id. It pulls changed_by from app.user_id.
-- Application code MUST set both via SET LOCAL inside withTenantUser().
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_log_writer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid;
  v_user uuid;
  v_before jsonb;
  v_after jsonb;
  v_entity uuid;
BEGIN
  v_user := app_current_user();

  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_entity := (to_jsonb(NEW)->>'id')::uuid;
    -- For the tenants table itself, the entity id IS the tenant id.
    IF TG_TABLE_NAME = 'tenants' THEN
      v_tenant := v_entity;
    ELSE
      v_tenant := COALESCE(
        NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid,
        app_current_tenant()
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_entity := (to_jsonb(NEW)->>'id')::uuid;
    IF TG_TABLE_NAME = 'tenants' THEN
      v_tenant := v_entity;
    ELSE
      v_tenant := COALESCE(
        NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid,
        NULLIF(to_jsonb(OLD)->>'tenant_id', '')::uuid,
        app_current_tenant()
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_entity := (to_jsonb(OLD)->>'id')::uuid;
    IF TG_TABLE_NAME = 'tenants' THEN
      v_tenant := v_entity;
    ELSE
      v_tenant := COALESCE(
        NULLIF(to_jsonb(OLD)->>'tenant_id', '')::uuid,
        app_current_tenant()
      );
    END IF;
  END IF;

  -- Skip writing when we cannot resolve a tenant (e.g., DELETE on tenants
  -- table itself for an orphan operator user). RLS would also reject it.
  IF v_tenant IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO audit_log (
    tenant_id, entity_type, entity_id, action, before, after, changed_by
  )
  VALUES (
    v_tenant, TG_TABLE_NAME, v_entity, lower(TG_OP), v_before, v_after, v_user
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Apply to Day 2 entities (tenants + users). Day 5+ adds: orders, payments,
-- dispatches, inventory_items.
DROP TRIGGER IF EXISTS audit_trg ON tenants;
CREATE TRIGGER audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION audit_log_writer();

DROP TRIGGER IF EXISTS audit_trg ON users;
CREATE TRIGGER audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_log_writer();
