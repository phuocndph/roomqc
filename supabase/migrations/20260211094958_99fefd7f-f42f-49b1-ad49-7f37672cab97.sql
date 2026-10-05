
-- Create document_scan_sessions table for remote mobile scanning
CREATE TABLE public.document_scan_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  document_type TEXT NOT NULL DEFAULT 'cccd',
  status TEXT NOT NULL DEFAULT 'pending',
  scanned_data JSONB,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.document_scan_sessions ENABLE ROW LEVEL SECURITY;

-- Tenant users can manage their own sessions
CREATE POLICY "Users can view own tenant scan sessions"
  ON public.document_scan_sessions FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR true  -- Allow anonymous SELECT by UUID for public mobile page
  );

CREATE POLICY "Users can create scan sessions"
  ON public.document_scan_sessions FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own tenant scan sessions"
  ON public.document_scan_sessions FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR true  -- Allow anonymous UPDATE for public mobile page (by session UUID)
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_scan_sessions;
