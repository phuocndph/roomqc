
-- ================================================================
-- Security hardening 2026-05-07
-- 1. bank_payment_settings: drop anon SELECT, add tenant-scoped auth SELECT
-- 2. document_scan_sessions: drop public SELECT/UPDATE, keep tenant-scoped + edge-only writes
-- 3. storage.objects guest-documents: scope INSERT/DELETE to tenant folder
-- 4. storage.objects hotel-logos: scope INSERT/UPDATE/DELETE to tenant folder
-- ================================================================

-- ---------- 1. bank_payment_settings ----------
DROP POLICY IF EXISTS "Public read active bank settings" ON public.bank_payment_settings;

-- Authenticated users can only read settings for hotels of their own tenant.
CREATE POLICY "bank_payment_settings_tenant_select"
  ON public.bank_payment_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

-- ---------- 2. document_scan_sessions ----------
-- Drop overly permissive public policies. Mobile remote-scan flow goes through
-- the `mobile-scan-upload` edge function which uses the service role and
-- already verifies the session id, so public SELECT/UPDATE are not required.
DROP POLICY IF EXISTS "Anyone can view scan session by id" ON public.document_scan_sessions;
DROP POLICY IF EXISTS "Anyone can complete pending scan sessions" ON public.document_scan_sessions;

-- Tenant-scoped policies already exist (`Tenant users can view scan sessions`,
-- `Tenant users can update scan sessions`, `Users can create scan sessions`).
-- The mobile scan page (ScanDocumentPage) is now updated to call an edge
-- function for status checks instead of querying the table directly as anon.

-- ---------- 3. storage.objects: guest-documents ----------
DROP POLICY IF EXISTS "Authenticated users can upload guest documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete guest documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view guest documents from same tenant" ON storage.objects;

CREATE POLICY "guest_documents_tenant_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'guest-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "guest_documents_tenant_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'guest-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "guest_documents_tenant_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'guest-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- ---------- 4. storage.objects: hotel-logos ----------
DROP POLICY IF EXISTS "Tenant users can upload hotel logos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can update hotel logos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can delete hotel logos" ON storage.objects;

CREATE POLICY "hotel_logos_tenant_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "hotel_logos_tenant_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hotel-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'hotel-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "hotel_logos_tenant_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hotel-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );
