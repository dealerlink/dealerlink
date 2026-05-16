-- webhook_events is intentionally NOT tenant-scoped: an inbound webhook
-- arrives before any tenant context is known. It is operator-only forensic
-- data, written by the webhook route handler with the BYPASSRLS role.
-- RLS is disabled explicitly (new tables default to disabled, but being
-- explicit keeps the security posture auditable alongside the other policies).
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;
