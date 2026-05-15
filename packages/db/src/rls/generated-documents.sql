-- Day 10: generated_documents — rendered PDF artifacts (quotations, …).
-- Standard tenant-isolation policy: a tenant only ever sees its own PDFs.
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON generated_documents;
CREATE POLICY tenant_isolation ON generated_documents
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
