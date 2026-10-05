CREATE TABLE IF NOT EXISTS public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_tenant_key ON public.ai_settings(tenant_id, config_key);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read AI settings of their tenant"
ON public.ai_settings
FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Only owners can insert AI settings"
ON public.ai_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = ai_settings.tenant_id
      AND (u.user_level_code IN ('super_admin','tenant_owner') OR u.is_super_admin = true)
  )
);

CREATE POLICY "Only owners can update AI settings"
ON public.ai_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = ai_settings.tenant_id
      AND (u.user_level_code IN ('super_admin','tenant_owner') OR u.is_super_admin = true)
  )
);

CREATE POLICY "Only owners can delete AI settings"
ON public.ai_settings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = ai_settings.tenant_id
      AND (u.user_level_code IN ('super_admin','tenant_owner') OR u.is_super_admin = true)
  )
);

CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();