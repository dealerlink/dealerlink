-- ============================================================================
-- AUDIT-LOG TRIGGER
-- ----------------------------------------------------------------------------
-- A single generic trigger function applied to every table that needs
-- audit history (per CLAUDE.md §6: orders, payments, dispatches, inventory).
-- Day 2 wires it up for tenants + users; later days add the rest.
--
-- Inputs read from session GUCs (set by withTenant() / tenantAction):
--   app.tenant_id   → fallback tenant scope when the row lacks one
--   app.user_id     → audit_log.changed_by
--   app.request_ip  → audit_log.ip
--   app.request_ua  → audit_log.user_agent
--   app.read_only   → '1' rejects writes (operator impersonation)
--
-- Sensitive columns (`password_hash`, `inbound_email_token`, anything that
-- ends in `_secret` or `_token`) are redacted to '[redacted]' in both
-- `before` and `after` JSON.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_redact(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  out_payload jsonb := payload;
BEGIN
  IF payload IS NULL THEN
    RETURN NULL;
  END IF;
  FOR k IN SELECT jsonb_object_keys(payload)
  LOOP
    IF k = 'password_hash'
       OR k = 'inbound_email_token'
       OR k LIKE '%_secret'
       OR k LIKE '%_token'
    THEN
      IF payload ? k AND payload->>k IS NOT NULL THEN
        out_payload := jsonb_set(out_payload, ARRAY[k], to_jsonb('[redacted]'::text));
      END IF;
    END IF;
  END LOOP;
  RETURN out_payload;
END;
$$;

CREATE OR REPLACE FUNCTION audit_log_writer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid;
  v_user uuid;
  v_ip text;
  v_ua text;
  v_read_only text;
  v_before jsonb;
  v_after jsonb;
  v_entity uuid;
BEGIN
  v_read_only := NULLIF(current_setting('app.read_only', true), '');
  IF v_read_only IS NOT NULL THEN
    RAISE EXCEPTION 'Mutations are not allowed in read-only context (operator impersonation)'
      USING ERRCODE = '42501';
  END IF;

  v_user := app_current_user();
  v_ip := NULLIF(current_setting('app.request_ip', true), '');
  v_ua := NULLIF(current_setting('app.request_ua', true), '');

  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := audit_redact(to_jsonb(NEW));
    v_entity := (to_jsonb(NEW)->>'id')::uuid;
    IF TG_TABLE_NAME = 'tenants' THEN
      v_tenant := v_entity;
    ELSE
      v_tenant := COALESCE(
        NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid,
        app_current_tenant()
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := audit_redact(to_jsonb(OLD));
    v_after := audit_redact(to_jsonb(NEW));
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
    v_before := audit_redact(to_jsonb(OLD));
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

  -- Skip the audit row when we cannot resolve a tenant (e.g., operator-
  -- level changes to a user with tenant_id NULL). The mutation itself
  -- still goes through; audit just has no tenant scope to attach to.
  IF v_tenant IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO audit_log (
    tenant_id, entity_type, entity_id, action,
    before, after, changed_by, ip, user_agent
  )
  VALUES (
    v_tenant, TG_TABLE_NAME, v_entity, lower(TG_OP),
    v_before, v_after, v_user, v_ip, v_ua
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
