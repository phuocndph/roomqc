-- Add hotel_id and tenant_id columns to bank_payment_settings
ALTER TABLE public.bank_payment_settings 
ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Create unique index for one active setting per hotel
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_payment_settings_hotel_active 
ON public.bank_payment_settings(hotel_id) 
WHERE hotel_id IS NOT NULL AND is_active = true;

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can manage bank settings" ON public.bank_payment_settings;
DROP POLICY IF EXISTS "Allow public read active bank_payment_settings" ON public.bank_payment_settings;
DROP POLICY IF EXISTS "Authenticated users can view active bank settings" ON public.bank_payment_settings;

-- Helper function to check if user is owner
CREATE OR REPLACE FUNCTION public.is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND (
      u.user_level_code = 'tenant_owner'
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = u.id AND ur.role = 'owner'
      )
    )
  )
$$;

-- Policy: Owners can manage their hotel bank settings (INSERT, UPDATE, DELETE)
CREATE POLICY "Owners can manage bank settings"
ON public.bank_payment_settings
FOR ALL
USING (
  public.is_super_admin() 
  OR (
    public.is_owner_user()
    AND tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
)
WITH CHECK (
  public.is_super_admin() 
  OR (
    public.is_owner_user()
    AND tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
);

-- Policy: Authenticated users can view active settings of their tenant
CREATE POLICY "Users can view their tenant bank settings"
ON public.bank_payment_settings
FOR SELECT
TO authenticated
USING (
  is_active = true 
  AND (
    public.is_super_admin()
    OR tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
);

-- Policy: Public can read active settings by ID (for PaymentQRPage)
CREATE POLICY "Public read active bank settings"
ON public.bank_payment_settings
FOR SELECT
TO anon
USING (is_active = true);