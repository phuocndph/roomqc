-- Enable RLS on tenants table (policies already exist)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Enable RLS on payment_webhook_logs table (used for audit, service role only)
ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for payment_webhook_logs - only super admins can view
CREATE POLICY "Super admins can view webhook logs" ON public.payment_webhook_logs
FOR SELECT USING (public.is_super_admin());

-- Create policy for service role insert (always allowed via service role)
CREATE POLICY "Service role can insert webhook logs" ON public.payment_webhook_logs
FOR INSERT WITH CHECK (true);

-- Fix email_templates policy - remove system template exposure to all users
DROP POLICY IF EXISTS "Users view email templates" ON public.email_templates;

-- Create new restrictive policy - users can only view their tenant's templates
CREATE POLICY "Users view own tenant templates" ON public.email_templates
FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- Allow super admins to view all templates
CREATE POLICY "Super admins view all templates" ON public.email_templates
FOR SELECT USING (public.is_super_admin());