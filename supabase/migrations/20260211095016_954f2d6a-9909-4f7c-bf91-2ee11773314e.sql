
-- Fix overly permissive UPDATE policy - restrict anonymous updates
DROP POLICY "Users can update own tenant scan sessions" ON public.document_scan_sessions;
DROP POLICY "Users can view own tenant scan sessions" ON public.document_scan_sessions;

-- Authenticated tenant users can view/update
CREATE POLICY "Tenant users can view scan sessions"
  ON public.document_scan_sessions FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Anonymous can view by UUID (for public mobile page)
CREATE POLICY "Anonymous can view scan session by id"
  ON public.document_scan_sessions FOR SELECT
  USING (auth.uid() IS NULL);

-- Tenant users can update their sessions
CREATE POLICY "Tenant users can update scan sessions"
  ON public.document_scan_sessions FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Anonymous can update pending sessions (mobile page completing scan)
CREATE POLICY "Anonymous can complete scan sessions"
  ON public.document_scan_sessions FOR UPDATE
  USING (status = 'pending')
  WITH CHECK (status = 'completed');
